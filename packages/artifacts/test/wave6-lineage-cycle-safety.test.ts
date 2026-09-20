import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { ProjectArtifactStore } from "../src/store.js";
import { LineageError } from "../src/lineage-error.js";

// -----------------------------------------------------------------------------
// Wave 6 · LINEAGE-1 · Cycle-safe canonical lineage resolver regression.
//
// Contract enforced by these tests (see packages/artifacts/src/store.ts
// resolveLineage / getParentIdCandidate):
//
//   - `lineage.parentArtifactId` present is authoritative. Empty string is
//     an EXPLICIT root marker and does NOT fall through to legacy fields.
//   - Legacy fallback (top-level parentArtifactId, sourceSignedId,
//     sourcePlanId) applies ONLY when the `parentArtifactId` key is absent
//     from the `lineage` object.
//   - Self-identifiers (planId, signedId, receiptId, txId) are NEVER parents.
//   - Cycles fail-closed with typed `LINEAGE_CYCLE_DETECTED`.
//   - Depth exhaustion fails-closed with typed `LINEAGE_DEPTH_EXCEEDED`.
//   - Missing parent preserves pre-Wave-6 behavior: return partial lineage
//     silently (missing-evidence policy is not redesigned by this wave).
//   - Schema-name casing has no effect on traversal.
//   - The exact Wave 4 receipt/signed/plan shape that previously hung must
//     now terminate in bounded time.
// -----------------------------------------------------------------------------

const PLAN_ID =
  "12819e7ae148ce513616114625135e450ea592f0980f55530e3fc6c56115e131";
const SIGNED_ID =
  "b66b90960d165c1026fdb68342b86f72883acd19cd3e2e22f94f57be3d91603c";
const RECEIPT_ID =
  "c07596a5ac21ca4a746a1da21589e5e5b88dcb298985fe733b3549184d92f48b";
const KASPA_TX_ID =
  "dc228d614488471f0804f368e8ddee605c9993624bf17b6805688df214ca32aa";

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

describe("Wave 6 · LINEAGE-1 · cycle-safe canonical lineage resolver", () => {
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
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const planPath = path.join(
      artifactsDir,
      `${timestamp}-plan-${PLAN_ID.slice(0, 16)}.plan.json`
    );
    const signedPath = path.join(artifactsDir, "signed", `signedTx-${SIGNED_ID}.json`);
    const receiptPath = path.join(
      artifactsDir,
      "receipts",
      `txReceipt-${RECEIPT_ID}.json`
    );
    await writeJson(planPath, {
      schema: "hardkas.txPlan",
      planId: `plan-${PLAN_ID.slice(0, 16)}`,
      contentHash: PLAN_ID,
      lineage: { artifactId: PLAN_ID, parentArtifactId: "", sequence: 1 }
    });
    await writeJson(signedPath, {
      schema: "hardkas.signedTx",
      signedId: `signed-${SIGNED_ID.slice(0, 16)}`,
      contentHash: SIGNED_ID,
      txId: KASPA_TX_ID,
      sourcePlanId: `plan-${PLAN_ID.slice(0, 16)}`,
      lineage: { artifactId: SIGNED_ID, parentArtifactId: PLAN_ID, sequence: 2 }
    });
    await writeJson(receiptPath, {
      schema: "hardkas.txReceipt",
      contentHash: RECEIPT_ID,
      txId: KASPA_TX_ID,
      sourceSignedId: `signed-${SIGNED_ID.slice(0, 16)}`,
      lineage: { artifactId: RECEIPT_ID, parentArtifactId: SIGNED_ID, sequence: 3 }
    });

    const chain = await store.resolveLineage(receiptPath);
    expect(chain).toHaveLength(3);
    expect(chain[0].schema).toBe("hardkas.txPlan");
    expect(chain[1].schema).toBe("hardkas.signedTx");
    expect(chain[2].schema).toBe("hardkas.txReceipt");
  });

  it("2. root plan with explicit empty canonical parent terminates with exactly 1 node", async () => {
    const p = path.join(artifactsDir, "solo-plan.plan.json");
    await writeJson(p, {
      schema: "hardkas.txPlan",
      planId: "plan-solo",
      lineage: { artifactId: "solo-artifact-id", parentArtifactId: "", sequence: 1 }
    });
    const chain = await store.resolveLineage(p);
    expect(chain).toHaveLength(1);
    expect(chain[0].planId).toBe("plan-solo");
  });

  it("3. canonical non-empty parent resolves correctly", async () => {
    const parentId = "aa".repeat(32);
    const childId = "bb".repeat(32);
    await writeJson(path.join(artifactsDir, "plans", `parent-${parentId}.json`), {
      schema: "hardkas.txPlan",
      lineage: { artifactId: parentId, parentArtifactId: "", sequence: 1 }
    });
    await writeJson(path.join(artifactsDir, "signed", `child-${childId}.json`), {
      schema: "hardkas.signedTx",
      lineage: { artifactId: childId, parentArtifactId: parentId, sequence: 2 }
    });
    const chain = await store.resolveLineage(childId);
    expect(chain.map((n: any) => n.lineage.artifactId)).toEqual([parentId, childId]);
  });

  it("4. canonical empty parent does NOT fall through to `planId`", async () => {
    // A plan whose canonical lineage explicitly says root. Its own planId is a
    // self-identifier, not a parent. Pre-Wave-6 this looped forever.
    const p = path.join(artifactsDir, "fallthrough-guard-plan.plan.json");
    await writeJson(p, {
      schema: "hardkas.txPlan",
      planId: "plan-selfref-guard",
      lineage: { artifactId: "sr-artifact-id", parentArtifactId: "", sequence: 1 }
    });
    const chain = await store.resolveLineage(p);
    expect(chain).toHaveLength(1);
    // If planId were being treated as parent, resolveLineage would either
    // loop forever or attempt to re-read the same plan and unshift a
    // duplicate. Neither happens.
    expect(chain[0].planId).toBe("plan-selfref-guard");
  });

  // ---------------------------------------------------------------------------
  // 5-8 · canonical vs legacy precedence + legacy compatibility
  // ---------------------------------------------------------------------------

  it("5. canonical parent wins over conflicting legacy `sourcePlanId`", async () => {
    const canonicalParent = "aa".repeat(32);
    const legacyParent = "cc".repeat(32);
    const child = "bb".repeat(32);
    await writeJson(path.join(artifactsDir, "plans", `cnc-${canonicalParent}.json`), {
      schema: "hardkas.txPlan",
      lineage: { artifactId: canonicalParent, parentArtifactId: "", sequence: 1 }
    });
    await writeJson(path.join(artifactsDir, "plans", `lgc-${legacyParent}.json`), {
      schema: "hardkas.txPlan",
      lineage: { artifactId: legacyParent, parentArtifactId: "", sequence: 1 }
    });
    await writeJson(path.join(artifactsDir, "signed", `child-${child}.json`), {
      schema: "hardkas.signedTx",
      sourcePlanId: legacyParent, // legacy fallback pointing at a DIFFERENT parent
      lineage: { artifactId: child, parentArtifactId: canonicalParent, sequence: 2 }
    });
    const chain = await store.resolveLineage(child);
    // Canonical wins: chain starts at canonicalParent, not legacyParent.
    expect(chain.map((n: any) => n.lineage.artifactId)).toEqual([canonicalParent, child]);
  });

  it("6. legacy artifact with canonical lineage parent field ABSENT can resolve via `sourcePlanId`", async () => {
    const parentId = "aa".repeat(32);
    // Legacy child: no `lineage` object at all → fallback to sourcePlanId.
    // We identify the parent by its 64-hex ID via findArtifactPathById.
    await writeJson(path.join(artifactsDir, "plans", `legacy-parent-${parentId}.json`), {
      schema: "hardkas.txPlan",
      lineage: { artifactId: parentId, parentArtifactId: "", sequence: 1 }
    });
    const legacyChildPath = path.join(artifactsDir, "signed", "legacy-child.json");
    await writeJson(legacyChildPath, {
      schema: "hardkas.signedTx",
      sourcePlanId: parentId
      // no lineage block
    });
    const chain = await store.resolveLineage(legacyChildPath);
    expect(chain).toHaveLength(2);
    expect(chain[0].lineage.artifactId).toBe(parentId);
  });

  it("7. legacy receipt-like artifact can resolve via `sourceSignedId`", async () => {
    const parentId = "dd".repeat(32);
    await writeJson(path.join(artifactsDir, "signed", `legacy-signed-${parentId}.json`), {
      schema: "hardkas.signedTx",
      lineage: { artifactId: parentId, parentArtifactId: "", sequence: 1 }
    });
    const legacyReceiptPath = path.join(artifactsDir, "receipts", "legacy-receipt.json");
    await writeJson(legacyReceiptPath, {
      schema: "hardkas.txReceipt",
      sourceSignedId: parentId
      // no lineage block
    });
    const chain = await store.resolveLineage(legacyReceiptPath);
    expect(chain).toHaveLength(2);
    expect(chain[0].lineage.artifactId).toBe(parentId);
  });

  it("8. top-level legacy `parentArtifactId` remains supported", async () => {
    const parentId = "ee".repeat(32);
    await writeJson(path.join(artifactsDir, "plans", `topleg-parent-${parentId}.json`), {
      schema: "hardkas.txPlan",
      lineage: { artifactId: parentId, parentArtifactId: "", sequence: 1 }
    });
    const legacyChildPath = path.join(artifactsDir, "signed", "topleg-child.json");
    await writeJson(legacyChildPath, {
      schema: "hardkas.signedTx",
      parentArtifactId: parentId
      // no lineage block
    });
    const chain = await store.resolveLineage(legacyChildPath);
    expect(chain).toHaveLength(2);
    expect(chain[0].lineage.artifactId).toBe(parentId);
  });

  // ---------------------------------------------------------------------------
  // 9 · planId is never a parent
  // ---------------------------------------------------------------------------

  it("9. `planId` alone is NEVER interpreted as a parent", async () => {
    // Artifact with no lineage AND no legacy fallbacks — only planId.
    // Pre-Wave-6 getParentId would have returned planId. Wave-6 must not.
    const p = path.join(artifactsDir, "orphan-plan.plan.json");
    await writeJson(p, {
      schema: "hardkas.txPlan",
      planId: "plan-orphan"
      // no lineage, no parentArtifactId, no sourcePlanId, no sourceSignedId
    });
    const chain = await store.resolveLineage(p);
    // Only the artifact itself is returned; planId is not chased.
    expect(chain).toHaveLength(1);
    expect(chain[0].planId).toBe("plan-orphan");
  });

  // ---------------------------------------------------------------------------
  // 10-13 · cycle + depth safety
  // ---------------------------------------------------------------------------

  it("10. A → A throws LINEAGE_CYCLE_DETECTED", async () => {
    const aId = "aa".repeat(32);
    const aPath = path.join(artifactsDir, "signed", `A-${aId}.json`);
    await writeJson(aPath, {
      schema: "hardkas.signedTx",
      lineage: { artifactId: aId, parentArtifactId: aId, sequence: 1 }
    });
    await expect(store.resolveLineage(aPath)).rejects.toMatchObject({
      name: "LineageError",
      code: "LINEAGE_CYCLE_DETECTED"
    });
  });

  it("11. A → B → A throws LINEAGE_CYCLE_DETECTED", async () => {
    const aId = "aa".repeat(32);
    const bId = "bb".repeat(32);
    await writeJson(path.join(artifactsDir, "signed", `A-${aId}.json`), {
      schema: "hardkas.signedTx",
      lineage: { artifactId: aId, parentArtifactId: bId, sequence: 1 }
    });
    await writeJson(path.join(artifactsDir, "signed", `B-${bId}.json`), {
      schema: "hardkas.signedTx",
      lineage: { artifactId: bId, parentArtifactId: aId, sequence: 1 }
    });
    await expect(store.resolveLineage(aId)).rejects.toMatchObject({
      name: "LineageError",
      code: "LINEAGE_CYCLE_DETECTED"
    });
  });

  it("12. chain within configured depth succeeds", async () => {
    // Build a 5-hop chain (6 nodes) — well within MAX_LINEAGE_PARENT_HOPS=64.
    const N = 6;
    const ids: string[] = [];
    for (let i = 0; i < N; i++) {
      ids.push(String(i).padStart(2, "0").repeat(32));
    }
    for (let i = 0; i < N; i++) {
      const parent = i === 0 ? "" : ids[i - 1]!;
      await writeJson(path.join(artifactsDir, "signed", `n${i}-${ids[i]!}.json`), {
        schema: "hardkas.signedTx",
        lineage: { artifactId: ids[i]!, parentArtifactId: parent, sequence: i + 1 }
      });
    }
    const chain = await store.resolveLineage(ids[N - 1]!);
    expect(chain).toHaveLength(N);
    expect(chain[0].lineage.artifactId).toBe(ids[0]);
    expect(chain[N - 1].lineage.artifactId).toBe(ids[N - 1]);
  });

  it("13. chain exceeding configured depth throws LINEAGE_DEPTH_EXCEEDED", async () => {
    // Build a chain of exactly 66 nodes (65 parent hops). Since
    // MAX_LINEAGE_PARENT_HOPS is 64, the (MAX+1)-th hop must throw
    // LINEAGE_DEPTH_EXCEEDED — NOT LINEAGE_CYCLE_DETECTED, because
    // every node has a distinct artifactId.
    //
    // IDs are high-entropy sha256 digests keyed by index so no id is a
    // substring (or partial-16 prefix) of any other id. This side-steps
    // the pre-existing substring resolver in `findArtifactPathById` — a
    // legacy behaviour Wave 6 is not authorised to modify.
    const N = 66;
    const idFor = (i: number) =>
      crypto.createHash("sha256").update(`wave6-depth-${i}`).digest("hex");
    for (let i = 0; i < N; i++) {
      const parent = i === 0 ? "" : idFor(i - 1);
      await writeJson(
        path.join(artifactsDir, "signed", `signedTx-${idFor(i)}.json`),
        {
          schema: "hardkas.signedTx",
          lineage: {
            artifactId: idFor(i),
            parentArtifactId: parent,
            sequence: i + 1
          }
        }
      );
    }
    await expect(store.resolveLineage(idFor(N - 1))).rejects.toMatchObject({
      name: "LineageError",
      code: "LINEAGE_DEPTH_EXCEEDED"
    });
  });

  // ---------------------------------------------------------------------------
  // 14 · missing-parent preserves pre-Wave-6 behavior
  // ---------------------------------------------------------------------------

  it("14. missing-parent behavior returns the partial lineage silently", async () => {
    const childId = "ff".repeat(32);
    const missingParentId = "00".repeat(32);
    const childPath = path.join(artifactsDir, "signed", `child-${childId}.json`);
    await writeJson(childPath, {
      schema: "hardkas.signedTx",
      lineage: {
        artifactId: childId,
        parentArtifactId: missingParentId,
        sequence: 2
      }
    });
    // No parent on disk. Pre-Wave-6 semantics: swallow, return partial.
    const chain = await store.resolveLineage(childPath);
    expect(chain).toHaveLength(1);
    expect(chain[0].lineage.artifactId).toBe(childId);
  });

  // ---------------------------------------------------------------------------
  // 15 · casing must not affect traversal
  // ---------------------------------------------------------------------------

  it("15. schema casing has no effect on traversal", async () => {
    // A synthetic artifact with an oddly-cased schema string still terminates
    // correctly. Pre-Wave-6 the cycle-break check depended on
    // schema.includes("TxPlan") — a casing accident. Wave-6 must be immune.
    const oddPath = path.join(artifactsDir, "odd-schema.plan.json");
    await writeJson(oddPath, {
      schema: "HARDKAS.TXPLAN.V1", // all caps — a case never seen in production
      planId: "plan-odd",
      lineage: { artifactId: "odd-id", parentArtifactId: "", sequence: 1 }
    });
    const chain = await store.resolveLineage(oddPath);
    expect(chain).toHaveLength(1);
    expect(chain[0].planId).toBe("plan-odd");
  });

  // ---------------------------------------------------------------------------
  // 16 · exact Wave 4 shape that previously hung
  // ---------------------------------------------------------------------------

  it("16. exact Wave 4 receipt/signed/plan shape now terminates in bounded time", async () => {
    // Reproduce the exact field shape observed in the Wave 4 real-node
    // workspace, including sourcePlanId + sourceSignedId + planId + signedId
    // + txId + non-empty legacy fields. Pre-Wave-6 this hung forever.
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeJson(
      path.join(artifactsDir, `${timestamp}-plan-${PLAN_ID.slice(0, 16)}.plan.json`),
      {
        schema: "hardkas.txPlan",
        planId: `plan-${PLAN_ID.slice(0, 16)}`,
        contentHash: PLAN_ID,
        lineage: {
          artifactId: PLAN_ID,
          lineageId: "wave4-lineage",
          parentArtifactId: "",
          rootArtifactId: "wave4-root",
          sequence: 1
        }
      }
    );
    await writeJson(path.join(artifactsDir, "signed", `signedTx-${SIGNED_ID}.json`), {
      schema: "hardkas.signedTx",
      signedId: `signed-${SIGNED_ID.slice(0, 16)}`,
      contentHash: SIGNED_ID,
      txId: KASPA_TX_ID,
      sourcePlanId: `plan-${PLAN_ID.slice(0, 16)}`,
      lineage: {
        artifactId: SIGNED_ID,
        lineageId: "wave4-lineage",
        parentArtifactId: PLAN_ID,
        rootArtifactId: "wave4-root",
        sequence: 2
      }
    });
    await writeJson(
      path.join(artifactsDir, "receipts", `txReceipt-${RECEIPT_ID}.json`),
      {
        schema: "hardkas.txReceipt",
        contentHash: RECEIPT_ID,
        txId: KASPA_TX_ID,
        sourceSignedId: `signed-${SIGNED_ID.slice(0, 16)}`,
        lineage: {
          artifactId: RECEIPT_ID,
          lineageId: "wave4-lineage",
          parentArtifactId: SIGNED_ID,
          rootArtifactId: "wave4-root",
          sequence: 3
        }
      }
    );

    const t0 = Date.now();
    const chain = await store.resolveLineage(RECEIPT_ID);
    const elapsedMs = Date.now() - t0;
    expect(chain).toHaveLength(3);
    expect(chain[0].schema).toBe("hardkas.txPlan");
    expect(chain[1].schema).toBe("hardkas.signedTx");
    expect(chain[2].schema).toBe("hardkas.txReceipt");
    // Sanity: must complete well under any conceivable "hang" threshold.
    expect(elapsedMs).toBeLessThan(2000);
  });

  it("throws LineageError instances (typed)", async () => {
    const aId = "aa".repeat(32);
    await writeJson(path.join(artifactsDir, "signed", `A-${aId}.json`), {
      schema: "hardkas.signedTx",
      lineage: { artifactId: aId, parentArtifactId: aId, sequence: 1 }
    });
    let caught: unknown;
    try {
      await store.resolveLineage(aId);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(LineageError);
  });
});
