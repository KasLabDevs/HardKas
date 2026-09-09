import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ProjectArtifactStore } from "../src/store.js";

/**
 * Regression: a signed transaction could not resolve its parent plan.
 *
 * `tx plan --out` persists the plan at the ROOT of `.hardkas/artifacts/` as
 * `<timestamp>-<planId>.plan.json`, while `findArtifactPathById` only searched
 * the canonical subdirectories. `tx send <signedTx>` therefore always failed
 * with `parent_plan_unresolved`, and every downstream identifier degraded to
 * "unknown".
 */
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
    const planId = "plan-ff31f71505ac1b00";
    const plan = {
      schema: "hardkas.txPlan.v1",
      planId,
      contentHash: "hash-root-plan",
      networkId: "simulated"
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.writeFile(
      path.join(artifactsDir, `${timestamp}-${planId}.plan.json`),
      JSON.stringify(plan),
      "utf-8"
    );

    await expect(store.exists(planId)).resolves.toBe(true);

    const read = (await store.readArtifact(planId)) as typeof plan;
    expect(read.planId).toBe(planId);
    expect(read.contentHash).toBe("hash-root-plan");
  });

  it("still prefers a canonical subdirectory over the root", async () => {
    const planId = "plan-duplicate";

    // Written by hand rather than through writeArtifact(), which names files
    // by contentHash and would not embed the planId we look up here.
    const plansDir = path.join(artifactsDir, "plans");
    await fs.mkdir(plansDir, { recursive: true });
    await fs.writeFile(
      path.join(plansDir, `txPlan-${planId}.json`),
      JSON.stringify({
        schema: "hardkas.txPlan.v1",
        planId,
        contentHash: "hash-from-plans-dir"
      }),
      "utf-8"
    );

    await fs.writeFile(
      path.join(artifactsDir, `2020-01-01-${planId}.plan.json`),
      JSON.stringify({
        schema: "hardkas.txPlan.v1",
        planId,
        contentHash: "hash-from-root"
      }),
      "utf-8"
    );

    const read = (await store.readArtifact(planId)) as { contentHash: string };
    expect(read.contentHash).toBe("hash-from-plans-dir");
  });

  it("never returns a directory whose name contains the id", async () => {
    // A subdirectory named after the id must not be mistaken for an artifact.
    await fs.mkdir(path.join(artifactsDir, "plan-trap"), { recursive: true });

    await expect(store.exists("plan-trap")).resolves.toBe(false);
    await expect(store.readArtifact("plan-trap")).rejects.toThrow(
      /not found in store/
    );
  });

  it("keeps reporting a genuinely missing artifact as missing", async () => {
    await expect(store.exists("plan-does-not-exist")).resolves.toBe(false);
    await expect(store.readArtifact("plan-does-not-exist")).rejects.toThrow(
      /not found in store/
    );
  });
});
