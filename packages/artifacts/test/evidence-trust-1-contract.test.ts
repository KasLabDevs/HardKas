import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { ProjectArtifactStore } from "../src/store.js";
import { createTxPlanArtifact } from "../src/tx-plan.js";
import { createSimulatedSignedTxArtifact } from "../src/signed-tx.js";
import { calculateContentHash, CURRENT_HASH_VERSION, isAuthenticatedPath } from "../src/canonical.js";
import { verifyArtifactSemantics } from "../src/verify.js";
import { explainArtifact } from "../src/explain.js";
import { resolveParentReference, resolveLineageChain } from "../src/lineage-chain.js";

// EVIDENCE-TRUST-1 · the contract chosen after the BEFORE (D1–D4): a published identity is write-once and the stored copy
// is what comes back; a conflict is typed and touches nothing; lineage claims say resolved / missing / invalid /
// unresolved from what was looked up; a difference says whether the content hash covers it.

const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };

function makePlan(amount = 500n, rpcUrl?: string) {
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
    ...(rpcUrl ? { rpcUrl } : {}),
    from: { input: "alice", address: "kaspasim:qqalice", accountName: "alice" },
    to: { input: "bob", address: "kaspasim:qqbob" },
    amountSompi: amount,
    plan
  }) as any;
}

const errorCode = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e: any) {
    return e?.code ?? `ERR:${e?.message}`;
  }
};

describe("EVIDENCE-TRUST-1 · write-once publication (D1/D2)", () => {
  let ws: string;
  let store: ProjectArtifactStore;
  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-et1-contract-"));
    store = new ProjectArtifactStore(ws);
  });
  afterEach(() => fs.rmSync(ws, { recursive: true, force: true }));

  it("the first publication writes; publishing the same identity again writes nothing and returns the stored copy", async () => {
    const plan = makePlan();
    const first = await store.publishArtifact(plan);
    expect(first.written).toBe(true);
    const later = { ...structuredClone(first.artifact), createdAt: "2030-01-01T00:00:00.000Z" };
    expect(calculateContentHash(later, CURRENT_HASH_VERSION), "precondition: createdAt is outside the identity").toBe(plan.contentHash);
    const again = await store.publishArtifact(later);
    expect(again.written).toBe(false);
    expect(again.path).toBe(first.path);
    expect(again.artifact.createdAt).toBe(plan.createdAt);
    expect(again.artifact.contentHash).toBe(plan.contentHash);
  });

  it("publishing identical bytes again is a no-op", async () => {
    const plan = makePlan();
    const first = await store.publishArtifact(plan);
    const before = fs.statSync(first.path).mtimeMs;
    const again = await store.publishArtifact(plan);
    expect(again.written).toBe(false);
    expect(fs.statSync(first.path).mtimeMs).toBe(before);
  });

  it.each([
    ["a tampered copy", (p: string) => fs.writeFileSync(p, JSON.stringify({ ...JSON.parse(fs.readFileSync(p, "utf8")), amountSompi: "1" }, null, 2) + "\n")],
    ["content that is not JSON", (p: string) => fs.writeFileSync(p, "garbage")],
    ["another artifact", (p: string) => fs.writeFileSync(p, JSON.stringify(makePlan(600n), null, 2) + "\n")]
  ])("%s at the identity's path → ARTIFACT_IDENTITY_CONFLICT, not a byte touched", async (_what, plant) => {
    const plan = makePlan();
    const { path: at } = await store.publishArtifact(plan);
    plant(at);
    const planted = fs.readFileSync(at);
    expect(await errorCode(store.publishArtifact(plan))).toBe("ARTIFACT_IDENTITY_CONFLICT");
    expect(await errorCode(store.writeArtifact(plan))).toBe("ARTIFACT_IDENTITY_CONFLICT");
    expect(fs.readFileSync(at).equals(planted)).toBe(true);
  });
});

describe("EVIDENCE-TRUST-1 · lineage claims from what was looked up (D3)", () => {
  let ws: string;
  let store: ProjectArtifactStore;
  let plan: any;
  let signed: any;
  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-et1-lineage-"));
    store = new ProjectArtifactStore(ws);
    plan = makePlan();
    signed = createSimulatedSignedTxArtifact(plan, plan.from.address, ctx);
    await store.publishArtifact(plan);
    await store.publishArtifact(signed);
  });
  afterEach(() => fs.rmSync(ws, { recursive: true, force: true }));

  it("resolved / missing / invalid / unresolved / root", async () => {
    expect(resolveParentReference(plan, { workspaceRoot: ws }).status).toBe("root");
    expect(resolveParentReference(signed, { workspaceRoot: ws })).toMatchObject({ status: "resolved", artifactId: plan.contentHash });
    expect(resolveParentReference(signed).status).toBe("unresolved");

    const planPath = (await store.publishArtifact(plan)).path;
    fs.writeFileSync(planPath, JSON.stringify({ ...plan, amountSompi: "1" }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    expect(resolveParentReference(signed, { workspaceRoot: ws }).status).toBe("invalid");
    fs.rmSync(planPath);
    expect(resolveParentReference(signed, { workspaceRoot: ws }).status).toBe("missing");
  });

  it("the chain is complete only when walked to the declared root", () => {
    const complete = resolveLineageChain(signed, { workspaceRoot: ws });
    expect(complete.complete).toBe(true);
    expect(complete.links.map((l) => [l.status, l.artifactId])).toEqual([
      ["here", signed.contentHash],
      ["resolved", plan.contentHash]
    ]);
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "hk-et1-empty-"));
    try {
      const broken = resolveLineageChain(signed, { workspaceRoot: elsewhere });
      expect(broken.complete).toBe(false);
      expect(broken.links[broken.links.length - 1]).toMatchObject({ status: "missing", artifactId: plan.contentHash });
    } finally {
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it("strict semantics with the workspace resolve the parent; without one the parent is PARENT_UNRESOLVED, never PARENT_MISSING", () => {
    const withWs = verifyArtifactSemantics(structuredClone(signed), { strict: true, workspaceRoot: ws });
    expect(withWs.issues.filter((i) => i.code.startsWith("PARENT_"))).toEqual([]);
    const without = verifyArtifactSemantics(structuredClone(signed), { strict: true });
    expect(without.issues.map((i) => i.code)).toContain("PARENT_UNRESOLVED");
    expect(without.issues.map((i) => i.code)).not.toContain("PARENT_MISSING");
    expect(without.ok, "strict verification still refuses what it could not resolve").toBe(false);
  });

  it("explainArtifact looks in the workspace it is given", async () => {
    const e = await explainArtifact(structuredClone(signed), { workspaceRoot: ws });
    expect(e.identity.parent).toMatchObject({ status: "resolved", artifactId: plan.contentHash });
    expect(e.security.issues.filter((i) => i.code.startsWith("PARENT_"))).toEqual([]);
    const blind = await explainArtifact(structuredClone(signed));
    expect(blind.identity.parent.status).toBe("unresolved");
  });
});

describe("EVIDENCE-TRUST-1 · what the content hash covers (D4)", () => {
  it.each([
    [["lineage", "parentArtifactId"], 5, true],
    [["lineage", "artifactId"], 5, false],
    [["contentHash"], 5, false],
    [["createdAt"], 5, false],
    [["rpcUrl"], 5, false],
    [["inputs", null, "amountSompi"], 5, true],
    [["execution", "createdAt"], 5, true],
    [["lineage", "parentArtifactId"], 3, false],
    [["amountSompi"], 3, true]
  ] as const)("%j under hash version %i → %s", (p, version, expected) => {
    expect(isAuthenticatedPath(p as unknown as Array<string | null>, version)).toBe(expected);
  });
});

describe("EVIDENCE-TRUST-1 · a plan records its locator without credentials (ET-C4)", () => {
  it("createTxPlanArtifact strips the userinfo and secret query values; the identity does not depend on it", () => {
    const withToken = makePlan(500n, "wss://op:ET1PASS@node.example:17110/?token=ET1TOKEN&network=testnet-10");
    expect(withToken.rpcUrl).toBe("wss://node.example:17110/?token=REDACTED&network=testnet-10");
    expect(withToken.contentHash).toBe(makePlan(500n).contentHash);
  });
});
