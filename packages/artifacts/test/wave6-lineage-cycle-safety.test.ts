import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { ProjectArtifactStore } from "../src/store.js";
import { LineageError } from "../src/lineage-error.js";
import { createTxPlanArtifact } from "../src/tx-plan.js";
import { createSimulatedSignedTxArtifact, createSimulatedTxReceipt } from "../src/signed-tx.js";
import { calculateContentHash } from "../src/canonical.js";

// -----------------------------------------------------------------------------
// Wave 6 · LINEAGE-1 · Cycle-safe canonical lineage resolver regression,
// re-based on the rc.23 remediation Wave 1.2 contract (Closure Pack IC-5′.6):
//
//   - `lineage.parentArtifactId` present is authoritative. Empty string is
//     an EXPLICIT root marker and does NOT fall through to anything.
//   - A persisted reference is NEVER resolved by a label: `sourcePlanId` /
//     `sourceSignedId` no longer act as parents (the Wave 6 legacy fallback
//     is gone). A top-level `parentArtifactId` is accepted only as a 64-hex id.
//   - Self-identifiers (planId, signedId, receiptId, txId) are NEVER parents.
//   - Every hop resolves by VERIFIED identity (recomputed hash); the fixtures
//     are therefore real: current-version producer chains, and explicit
//     hashVersion-3 legacy artifacts whose lineage was never authenticated
//     (the only artifacts that can carry cycles or exotic lineage on disk).
//   - Cycles fail-closed with typed `LINEAGE_CYCLE_DETECTED`.
//   - Depth exhaustion fails-closed with typed `LINEAGE_DEPTH_EXCEEDED`.
//   - Missing parent preserves pre-Wave-6 behavior: return partial lineage
//     silently (missing-evidence policy is not redesigned by this wave).
//   - Schema-name casing has no effect on traversal.
// -----------------------------------------------------------------------------

const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };

async function writeJson(p: string, obj: any) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj), "utf-8");
}

async function makeWorkspace(): Promise<{ ws: string; artifactsDir: string }> {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), "hk-wave6-lineage-"));
  const artifactsDir = path.join(ws, ".hardkas", "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });
  return { ws, artifactsDir };
}

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

/**
 * Explicit legacy fixture (hashVersion 3): `lineage`, `parentArtifactId` and
 * `contentHash` are name-excluded from the v3 hash, so the artifact's identity is
 * the hash of its body and ANY lineage can be attached without breaking it —
 * exactly how unauthenticated legacy lineage looks on disk.
 */
function legacyV3(body: Record<string, unknown>, lineage?: Record<string, unknown> | null, extra: Record<string, unknown> = {}): any {
  // `extra` holds authenticated legacy fields (sourcePlanId, txId, …): part of the body.
  const a: any = { ...body, ...extra, hashVersion: 3 };
  const h = calculateContentHash(a, 3);
  a.contentHash = h;
  // Labels are name-excluded in v3 and derive from the hash.
  if (typeof a.schema === "string" && a.schema.startsWith("hardkas.txPlan")) a.planId = `plan-${h.slice(0, 16)}`;
  if (typeof a.schema === "string" && a.schema.startsWith("hardkas.signedTx")) a.signedId = `signed-${h.slice(0, 16)}`;
  if (lineage) a.lineage = { ...lineage, artifactId: h };
  return a;
}

const v3Hash = (body: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  calculateContentHash({ ...body, ...extra, hashVersion: 3 }, 3);

describe("Wave 6 · LINEAGE-1 · cycle-safe canonical lineage resolver (IC-5′ re-base)", () => {
  let ws: string;
  let artifactsDir: string;
  let store: ProjectArtifactStore;

  beforeEach(async () => {
    const w = await makeWorkspace();
    ws = w.ws;
    artifactsDir = w.artifactsDir;
    store = new ProjectArtifactStore(ws);
  });

  afterEach(async () => {
    await fs.rm(ws, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // 1-4 · canonical parent semantics
  // ---------------------------------------------------------------------------

  it("1. receipt → signed → plan → ROOT terminates with exactly 3 nodes", async () => {
    const plan = makePlan();
    const signed = createSimulatedSignedTxArtifact(plan, plan.from.address, ctx);
    const receipt = createSimulatedTxReceipt(plan, "simtx_" + "1".repeat(32), ctx, {
      parentArtifact: signed as typeof signed & { contentHash: string },
      sourceSignedId: signed.signedId
    });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeJson(path.join(artifactsDir, `${timestamp}-plan-${plan.contentHash.slice(0, 16)}.plan.json`), plan);
    await writeJson(path.join(artifactsDir, "signed", `signedTx-${signed.contentHash}.json`), signed);
    const receiptPath = path.join(artifactsDir, "receipts", `txReceipt-${receipt.contentHash}.json`);
    await writeJson(receiptPath, receipt);

    const chain = await store.resolveLineage(receiptPath);
    expect(chain).toHaveLength(3);
    expect(chain[0].schema).toBe("hardkas.txPlan");
    expect(chain[1].schema).toBe("hardkas.signedTx");
    expect(chain[2].schema).toBe("hardkas.txReceipt");
  });

  it("2. root plan with explicit empty canonical parent terminates with exactly 1 node", async () => {
    const p = path.join(artifactsDir, "solo-plan.plan.json");
    const plan = legacyV3({ schema: "hardkas.txPlan", nonce: "solo" }, { parentArtifactId: "", sequence: 1 });
    await writeJson(p, plan);
    const chain = await store.resolveLineage(p);
    expect(chain).toHaveLength(1);
    expect(chain[0].planId).toBe(plan.planId);
  });

  it("3. canonical non-empty parent resolves correctly", async () => {
    const plan = makePlan();
    const signed = createSimulatedSignedTxArtifact(plan, plan.from.address, ctx);
    await writeJson(path.join(artifactsDir, "plans", `parent-${plan.contentHash}.json`), plan);
    await writeJson(path.join(artifactsDir, "signed", `child-${signed.contentHash}.json`), signed);
    const chain = await store.resolveLineage(signed.contentHash as string);
    expect(chain.map((n: any) => n.lineage.artifactId)).toEqual([plan.contentHash, signed.contentHash]);
  });

  it("4. canonical empty parent does NOT fall through to `planId`", async () => {
    // A plan whose canonical lineage explicitly says root. Its own planId is a
    // self-identifier, not a parent. Pre-Wave-6 this looped forever.
    const p = path.join(artifactsDir, "fallthrough-guard-plan.plan.json");
    const plan = legacyV3({ schema: "hardkas.txPlan", nonce: "guard" }, { parentArtifactId: "", sequence: 1 });
    await writeJson(p, plan);
    const chain = await store.resolveLineage(p);
    expect(chain).toHaveLength(1);
    expect(chain[0].planId).toBe(plan.planId);
  });

  // ---------------------------------------------------------------------------
  // 5-8 · canonical vs legacy labels (IC-5′.6: labels never resolve a parent)
  // ---------------------------------------------------------------------------

  it("5. canonical parent wins over a conflicting legacy `sourcePlanId` label", async () => {
    const canonical = makePlan(500n);
    const other = makePlan(600n);
    await writeJson(path.join(artifactsDir, "plans", `cnc-${canonical.contentHash}.json`), canonical);
    await writeJson(path.join(artifactsDir, "plans", `lgc-${other.contentHash}.json`), other);
    const child = legacyV3(
      { schema: "hardkas.signedTx", nonce: "child5" },
      { parentArtifactId: canonical.contentHash, sequence: 2 },
      { sourcePlanId: other.planId } // legacy label pointing at a DIFFERENT plan
    );
    await writeJson(path.join(artifactsDir, "signed", `child-${child.contentHash}.json`), child);
    const chain = await store.resolveLineage(child.contentHash);
    expect(chain.map((n: any) => n.lineage.artifactId)).toEqual([canonical.contentHash, child.contentHash]);
  });

  it("6. a legacy child whose only upward pointer is the `sourcePlanId` label returns a partial lineage (label never resolves)", async () => {
    const parent = makePlan();
    await writeJson(path.join(artifactsDir, "plans", `legacy-parent-${parent.contentHash}.json`), parent);
    const childPath = path.join(artifactsDir, "signed", "legacy-child.json");
    await writeJson(childPath, legacyV3({ schema: "hardkas.signedTx", nonce: "child6" }, null, { sourcePlanId: parent.planId }));
    // Wave 6 chased the label; IC-5′.6 forbids it. The chain stops at the child.
    const chain = await store.resolveLineage(childPath);
    expect(chain).toHaveLength(1);
    expect(chain[0].sourcePlanId).toBe(parent.planId);
  });

  it("7. a legacy receipt whose only upward pointer is `sourceSignedId` returns a partial lineage (label never resolves)", async () => {
    const plan = makePlan();
    const signed = createSimulatedSignedTxArtifact(plan, plan.from.address, ctx);
    await writeJson(path.join(artifactsDir, "signed", `legacy-signed-${signed.contentHash}.json`), signed);
    const receiptPath = path.join(artifactsDir, "receipts", "legacy-receipt.json");
    await writeJson(receiptPath, legacyV3({ schema: "hardkas.txReceipt", nonce: "r7" }, null, { sourceSignedId: signed.signedId }));
    const chain = await store.resolveLineage(receiptPath);
    expect(chain).toHaveLength(1);
  });

  it("8. top-level legacy `parentArtifactId` remains supported when it is a 64-hex artifactId", async () => {
    const parent = makePlan();
    await writeJson(path.join(artifactsDir, "plans", `topleg-parent-${parent.contentHash}.json`), parent);
    const childPath = path.join(artifactsDir, "signed", "topleg-child.json");
    await writeJson(childPath, legacyV3({ schema: "hardkas.signedTx", nonce: "child8" }, null, { parentArtifactId: parent.contentHash }));
    const chain = await store.resolveLineage(childPath);
    expect(chain).toHaveLength(2);
    expect(chain[0].lineage.artifactId).toBe(parent.contentHash);
  });

  // ---------------------------------------------------------------------------
  // 9 · planId is never a parent
  // ---------------------------------------------------------------------------

  it("9. `planId` alone is NEVER interpreted as a parent", async () => {
    const p = path.join(artifactsDir, "orphan-plan.plan.json");
    const plan = legacyV3({ schema: "hardkas.txPlan", nonce: "orphan" }, null);
    await writeJson(p, plan);
    const chain = await store.resolveLineage(p);
    expect(chain).toHaveLength(1);
    expect(chain[0].planId).toBe(plan.planId);
  });

  // ---------------------------------------------------------------------------
  // 10-13 · cycle + depth safety (legacy artifacts: lineage never authenticated)
  // ---------------------------------------------------------------------------

  it("10. A → A throws LINEAGE_CYCLE_DETECTED", async () => {
    const bodyA = { schema: "hardkas.signedTx", nonce: "A10" };
    const aId = v3Hash(bodyA);
    const aPath = path.join(artifactsDir, "signed", `A-${aId}.json`);
    await writeJson(aPath, legacyV3(bodyA, { parentArtifactId: aId, sequence: 1 }));
    await expect(store.resolveLineage(aPath)).rejects.toMatchObject({
      name: "LineageError",
      code: "LINEAGE_CYCLE_DETECTED"
    });
  });

  it("11. A → B → A throws LINEAGE_CYCLE_DETECTED", async () => {
    const bodyA = { schema: "hardkas.signedTx", nonce: "A11" };
    const bodyB = { schema: "hardkas.signedTx", nonce: "B11" };
    const aId = v3Hash(bodyA);
    const bId = v3Hash(bodyB);
    await writeJson(path.join(artifactsDir, "signed", `A-${aId}.json`), legacyV3(bodyA, { parentArtifactId: bId, sequence: 1 }));
    await writeJson(path.join(artifactsDir, "signed", `B-${bId}.json`), legacyV3(bodyB, { parentArtifactId: aId, sequence: 1 }));
    await expect(store.resolveLineage(aId)).rejects.toMatchObject({
      name: "LineageError",
      code: "LINEAGE_CYCLE_DETECTED"
    });
  });

  it("12. chain within configured depth succeeds", async () => {
    const N = 6;
    const bodies = Array.from({ length: N }, (_, i) => ({ schema: "hardkas.signedTx", nonce: `n12-${i}` }));
    const ids = bodies.map((b) => v3Hash(b));
    for (let i = 0; i < N; i++) {
      const parent = i === 0 ? "" : ids[i - 1]!;
      await writeJson(path.join(artifactsDir, "signed", `n${i}-${ids[i]!}.json`), legacyV3(bodies[i]!, { parentArtifactId: parent, sequence: i + 1 }));
    }
    const chain = await store.resolveLineage(ids[N - 1]!);
    expect(chain).toHaveLength(N);
    expect(chain[0].lineage.artifactId).toBe(ids[0]);
    expect(chain[N - 1].lineage.artifactId).toBe(ids[N - 1]);
  });

  it("13. chain exceeding configured depth throws LINEAGE_DEPTH_EXCEEDED", async () => {
    // 66 nodes (65 parent hops) against MAX_LINEAGE_PARENT_HOPS = 64: the
    // (MAX+1)-th hop must throw LINEAGE_DEPTH_EXCEEDED, not
    // LINEAGE_CYCLE_DETECTED, because every node has a distinct identity.
    const N = 66;
    const bodies = Array.from({ length: N }, (_, i) => ({ schema: "hardkas.signedTx", nonce: `depth-${i}` }));
    const ids = bodies.map((b) => v3Hash(b));
    for (let i = 0; i < N; i++) {
      const parent = i === 0 ? "" : ids[i - 1]!;
      await writeJson(path.join(artifactsDir, "signed", `signedTx-${ids[i]!}.json`), legacyV3(bodies[i]!, { parentArtifactId: parent, sequence: i + 1 }));
    }
    await expect(store.resolveLineage(ids[N - 1]!)).rejects.toMatchObject({
      name: "LineageError",
      code: "LINEAGE_DEPTH_EXCEEDED"
    });
  });

  // ---------------------------------------------------------------------------
  // 14 · missing-parent preserves pre-Wave-6 behavior
  // ---------------------------------------------------------------------------

  it("14. missing-parent behavior returns the partial lineage silently", async () => {
    const child = legacyV3({ schema: "hardkas.signedTx", nonce: "child14" }, { parentArtifactId: "00".repeat(32), sequence: 2 });
    const childPath = path.join(artifactsDir, "signed", `child-${child.contentHash}.json`);
    await writeJson(childPath, child);
    const chain = await store.resolveLineage(childPath);
    expect(chain).toHaveLength(1);
    expect(chain[0].lineage.artifactId).toBe(child.contentHash);
  });

  // ---------------------------------------------------------------------------
  // 15 · casing must not affect traversal
  // ---------------------------------------------------------------------------

  it("15. schema casing has no effect on traversal", async () => {
    const oddPath = path.join(artifactsDir, "odd-schema.plan.json");
    await writeJson(oddPath, legacyV3({ schema: "HARDKAS.TXPLAN.V1", nonce: "odd" }, { parentArtifactId: "", sequence: 1 }, { planId: "plan-odd" }));
    const chain = await store.resolveLineage(oddPath);
    expect(chain).toHaveLength(1);
    expect(chain[0].planId).toBe("plan-odd");
  });

  // ---------------------------------------------------------------------------
  // 16 · exact Wave 4 shape that previously hung (legacy: two-pass root fields)
  // ---------------------------------------------------------------------------

  it("16. exact Wave 4 receipt/signed/plan shape now terminates in bounded time", async () => {
    const kaspaTxId = "dc228d614488471f0804f368e8ddee605c9993624bf17b6805688df214ca32aa";
    const planBody = { schema: "hardkas.txPlan", nonce: "w4-plan" };
    const planId = v3Hash(planBody);
    const plan = legacyV3(planBody, { lineageId: "wave4-lineage", parentArtifactId: "", rootArtifactId: "wave4-root", sequence: 1 });
    const signedBody = { schema: "hardkas.signedTx", nonce: "w4-signed" };
    const signedExtra = { txId: kaspaTxId, sourcePlanId: plan.planId };
    const signedId = v3Hash(signedBody, signedExtra);
    const receiptBody = { schema: "hardkas.txReceipt", nonce: "w4-receipt" };
    const receiptExtra = { txId: kaspaTxId, sourceSignedId: `signed-${signedId.slice(0, 16)}` };
    const receiptId = v3Hash(receiptBody, receiptExtra);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeJson(path.join(artifactsDir, `${timestamp}-plan-${planId.slice(0, 16)}.plan.json`), plan);
    await writeJson(
      path.join(artifactsDir, "signed", `signedTx-${signedId}.json`),
      legacyV3(signedBody, { lineageId: "wave4-lineage", parentArtifactId: planId, rootArtifactId: "wave4-root", sequence: 2 }, signedExtra)
    );
    await writeJson(
      path.join(artifactsDir, "receipts", `txReceipt-${receiptId}.json`),
      legacyV3(receiptBody, { lineageId: "wave4-lineage", parentArtifactId: signedId, rootArtifactId: "wave4-root", sequence: 3 }, receiptExtra)
    );

    const t0 = Date.now();
    const chain = await store.resolveLineage(receiptId);
    const elapsedMs = Date.now() - t0;
    expect(chain).toHaveLength(3);
    expect(chain[0].schema).toBe("hardkas.txPlan");
    expect(chain[1].schema).toBe("hardkas.signedTx");
    expect(chain[2].schema).toBe("hardkas.txReceipt");
    expect(elapsedMs).toBeLessThan(2000);
  });

  it("throws LineageError instances (typed)", async () => {
    const bodyA = { schema: "hardkas.signedTx", nonce: "typed" };
    const aId = v3Hash(bodyA);
    await writeJson(path.join(artifactsDir, "signed", `A-${aId}.json`), legacyV3(bodyA, { parentArtifactId: aId, sequence: 1 }));
    let caught: unknown;
    try {
      await store.resolveLineage(aId);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(LineageError);
  });
});
