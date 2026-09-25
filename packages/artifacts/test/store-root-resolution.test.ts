import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { ProjectArtifactStore } from "../src/store.js";
import { resolveArtifact } from "../src/resolve.js";
import { createTxPlanArtifact } from "../src/tx-plan.js";

/**
 * Regression: a signed transaction could not resolve its parent plan.
 *
 * `tx plan --out` persists the plan at the ROOT of `.hardkas/artifacts/` as
 * `<timestamp>-<planId>.plan.json`, while the store only searched the canonical
 * subdirectories, so `tx send <signedTx>` always failed with
 * `parent_plan_unresolved`.
 *
 * Wave 1.2 re-base (Closure Pack IC-5′ / D-Q3.a): the store resolves by VERIFIED
 * identity wherever the file lives; a `planId` is a label that needs the `plan`
 * namespace (`readArtifact(planId)` → NAMESPACE_REQUIRED, no deprecation period).
 */

const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };

type SealedPlan = ReturnType<typeof createTxPlanArtifact> & { contentHash: string; planId: string };

function makePlan(amount = 500n): SealedPlan {
  const plan: any = {
    inputs: [{ outpoint: { transactionId: "ab".repeat(32), index: 0 }, amountSompi: 1000n, address: "kaspasim:qqalice", scriptPublicKey: "spk" }],
    outputs: [{ address: "kaspasim:qqbob", amountSompi: amount }],
    change: { address: "kaspasim:qqalice", amountSompi: 1000n - amount - 10n },
    estimatedFeeSompi: 10n,
    estimatedMass: 100n
  };
  return createTxPlanArtifact({
    ctx,
    networkId: asNetworkId("simnet") as any,
    mode: "simulator",
    from: { input: "alice", address: "kaspasim:qqalice", accountName: "alice" },
    to: { input: "bob", address: "kaspasim:qqbob" },
    amountSompi: amount,
    plan
  }) as SealedPlan;
}

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "OK";
  } catch (e: any) {
    return e?.code ?? `ERR:${e?.message}`;
  }
};

describe("ProjectArtifactStore: resolving artifacts written at the artifacts root", () => {
  let tmpDir: string;
  let artifactsDir: string;
  let store: ProjectArtifactStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-store-root-"));
    artifactsDir = path.join(tmpDir, ".hardkas", "artifacts");
    await fs.mkdir(artifactsDir, { recursive: true });
    store = new ProjectArtifactStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("resolves a plan written at the root with the `tx plan --out` naming", async () => {
    const plan = makePlan();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.writeFile(path.join(artifactsDir, `${timestamp}-${plan.planId}.plan.json`), JSON.stringify(plan), "utf-8");

    await expect(store.exists(plan.contentHash as string)).resolves.toBe(true);
    const read = (await store.readArtifact(plan.contentHash as string)) as { planId: string; contentHash: string };
    expect(read.planId).toBe(plan.planId);
    expect(read.contentHash).toBe(plan.contentHash);

    // The label goes through its namespace, verified against the hash.
    expect(await codeOf(store.readArtifact(plan.planId))).toBe("NAMESPACE_REQUIRED");
    expect((await resolveArtifact(tmpDir, { plan: plan.planId })).artifactId).toBe(plan.contentHash);
  });

  it("identical copies in a canonical subdirectory and at the root collapse to one identity", async () => {
    const plan = makePlan();
    const plansDir = path.join(artifactsDir, "plans");
    await fs.mkdir(plansDir, { recursive: true });
    await fs.writeFile(path.join(plansDir, `txPlan-${plan.planId}.json`), JSON.stringify(plan), "utf-8");
    await fs.writeFile(path.join(artifactsDir, `2020-01-01-${plan.planId}.plan.json`), JSON.stringify(plan), "utf-8");

    const r = await resolveArtifact(tmpDir, { plan: plan.planId });
    expect(r.artifactId).toBe(plan.contentHash);
    expect(r.copies).toHaveLength(2);
    expect(((await store.readArtifact(plan.contentHash as string)) as any).contentHash).toBe(plan.contentHash);
  });

  it("never returns a directory whose name contains the id", async () => {
    await fs.mkdir(path.join(artifactsDir, "plan-trap"), { recursive: true });
    expect(await codeOf(store.readArtifact("plan-trap"))).toBe("NAMESPACE_REQUIRED");
    expect(await codeOf(resolveArtifact(tmpDir, { plan: "plan-trap" }))).toBe("ARTIFACT_NOT_FOUND");
  });

  it("keeps reporting a genuinely missing artifact as missing", async () => {
    await expect(store.exists("0".repeat(64))).resolves.toBe(false);
    expect(await codeOf(store.readArtifact("0".repeat(64)))).toBe("ARTIFACT_NOT_FOUND");
    expect(await codeOf(resolveArtifact(tmpDir, { plan: "plan-does-not-exist" }))).toBe("ARTIFACT_NOT_FOUND");
  });
});
