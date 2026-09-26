import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { ProjectArtifactStore } from "../src/store.js";
import { ReceiptLookupError } from "../src/receipt-lookup-error.js";
import { resolveArtifact } from "../src/resolve.js";
import { createTxPlanArtifact } from "../src/tx-plan.js";
import { createSimulatedSignedTxArtifact, createSimulatedTxReceipt } from "../src/signed-tx.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "../src/canonical.js";

// -----------------------------------------------------------------------------
// Wave 11 · RESOLVER-1 · content-verified id resolution with STRICT namespace
// separation — re-based on the rc.23 remediation Wave 1.2 contract
// (Closure Pack IC-5′ / D-Q3.a, Q3-II):
//
//   (1) a lookup answers only with an artifact whose RECOMPUTED identity is the
//       queried one (no filename substring, no first match, no "prefer this dir");
//   (2) generic `readArtifact` / `exists` accept exactly a contained path or a
//       64-hex artifactId. The Wave 11 "legacy short-ID" exception (`planId`)
//       is gone: D-Q3.a grants no deprecation period; a label needs its namespace
//       (`resolveArtifact(root, { plan })`) and is verified against the hash;
//   (3) `txId` is the `tx` namespace (receipts only), never generic identity;
//   (4) the recomputed contentHash IS the identity of every artifact, including
//       snapshots without lineage (the Wave 5/11 "path-only" exclusion is gone).
// -----------------------------------------------------------------------------

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

async function writeJson(p: string, obj: unknown): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj), "utf-8");
}

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "OK";
  } catch (e: any) {
    return e?.code ?? `ERR:${e?.message}`;
  }
};

describe("Wave 11 · RESOLVER-1 · content-verified store lookups (IC-5′ re-base)", () => {
  let ws: string;
  let artifactsDir: string;
  let store: ProjectArtifactStore;

  beforeEach(async () => {
    ws = await fs.mkdtemp(path.join(os.tmpdir(), "hk-wave11-resolver-"));
    artifactsDir = path.join(ws, ".hardkas", "artifacts");
    await fs.mkdir(artifactsDir, { recursive: true });
    store = new ProjectArtifactStore(ws);
  });

  afterEach(async () => {
    await fs.rm(ws, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Positive contracts — canonical identity resolves wherever the file lives.
  // ---------------------------------------------------------------------------

  it("1. resolves a plan by full 64-hex canonical artifactId when the filename carries only the 16-hex short form", async () => {
    const plan = makePlan();
    await writeJson(path.join(artifactsDir, `2026-01-01-plan-${plan.contentHash.slice(0, 16)}.plan.json`), plan);

    await expect(store.exists(plan.contentHash)).resolves.toBe(true);
    const read = (await store.readArtifact(plan.contentHash)) as { lineage: { artifactId: string } };
    expect(read.lineage.artifactId).toBe(plan.contentHash);
  });

  it("3. a planId is the `plan` namespace: the generic reader refuses it, the typed lookup verifies it", async () => {
    const plan = makePlan();
    await writeJson(path.join(artifactsDir, "plans", `txPlan-${plan.planId}.json`), plan);

    // Wave 11 kept `readArtifact(planId)` as "the one legacy short-ID contract";
    // D-Q3.a removes it without a deprecation period (the vulnerability would stay alive).
    expect(await codeOf(store.exists(plan.planId))).toBe("NAMESPACE_REQUIRED");
    expect(await codeOf(store.readArtifact(plan.planId))).toBe("NAMESPACE_REQUIRED");

    const r = await resolveArtifact(ws, { plan: plan.planId });
    expect(r.artifactId).toBe(plan.contentHash);
    expect(r.artifact.planId).toBe(plan.planId);
  });

  it("10. lineage parent lookup by full canonical artifactId resolves", async () => {
    const plan = makePlan();
    await writeJson(path.join(artifactsDir, `2026-02-02-plan-${plan.contentHash.slice(0, 16)}.plan.json`), plan);
    const parent = (await store.readArtifact(plan.contentHash)) as { lineage: { artifactId: string } };
    expect(parent.lineage.artifactId).toBe(plan.contentHash);
  });

  // ---------------------------------------------------------------------------
  // Collision closures — filename-substring false positives never win.
  // ---------------------------------------------------------------------------

  it("2. does NOT return artifact Y when Y's filename shares the queried A's first-16-hex — canonical identity is authoritative", async () => {
    const plan = makePlan();
    const signed = createSimulatedSignedTxArtifact(plan, plan.from.address, ctx);
    const idY = signed.contentHash as string;
    const idA = idY.slice(0, 16) + "a".repeat(48);
    expect(idA).not.toBe(idY);

    await writeJson(path.join(artifactsDir, "signed", `signedTx-${idA}.json`), signed); // filename lies

    await expect(store.exists(idA)).resolves.toBe(false);
    expect(await codeOf(store.readArtifact(idA))).toBe("ARTIFACT_NOT_FOUND");
    expect(((await store.readArtifact(idY)) as any).contentHash).toBe(idY);
  });

  it("does NOT return the wrong artifact when a short token is a prefix of another artifact's planId", async () => {
    const plan = makePlan();
    await writeJson(path.join(artifactsDir, "plans", `txPlan-${plan.planId}.json`), plan);
    const prefix = plan.planId.slice(0, 9);

    expect(await codeOf(store.readArtifact(prefix))).toBe("NAMESPACE_REQUIRED");
    expect(await codeOf(resolveArtifact(ws, { plan: prefix }))).toBe("ARTIFACT_NOT_FOUND");
  });

  it("selects the verified label match past a filename-only impostor", async () => {
    const target = makePlan(500n);
    const other = makePlan(600n);
    // The impostor's FILE NAME carries the target's label; its content is another (valid) plan.
    await writeJson(path.join(artifactsDir, "plans", `aaa-txPlan-${target.planId}-longer.json`), other);
    await writeJson(path.join(artifactsDir, "plans", `zzz-txPlan-${target.planId}.json`), target);

    const r = await resolveArtifact(ws, { plan: target.planId });
    expect(r.artifactId).toBe(target.contentHash);
    expect(r.artifact.planId).toBe(target.planId);
  });

  it("identical copies of one plan in the canonical subdirectory and at the root collapse to one identity", async () => {
    const plan = makePlan();
    await writeJson(path.join(artifactsDir, "plans", `txPlan-${plan.planId}.json`), plan);
    await writeJson(path.join(artifactsDir, `2020-01-01-${plan.planId}.plan.json`), plan);

    const r = await resolveArtifact(ws, { plan: plan.planId });
    expect(r.artifactId).toBe(plan.contentHash);
    expect(r.copies).toHaveLength(2);
    expect(((await store.readArtifact(plan.contentHash)) as any).contentHash).toBe(plan.contentHash);
  });

  it("4. arbitrary partial IDs never resolve: they are neither a path nor a 64-hex artifactId", async () => {
    const plan = makePlan();
    await writeJson(path.join(artifactsDir, "plans", `txPlan-${plan.planId}.json`), plan);
    const canonicalId = plan.contentHash as string;

    for (const partial of [canonicalId.slice(0, 16), canonicalId.slice(0, 32), "plan-eeee", canonicalId + "extra"]) {
      expect(await codeOf(store.exists(partial)), partial).toBe("NAMESPACE_REQUIRED");
      expect(await codeOf(store.readArtifact(partial)), partial).toBe("NAMESPACE_REQUIRED");
    }
  });

  // ---------------------------------------------------------------------------
  // Namespace separation — the invariant Wave 11 locked, kept under IC-5′.
  // ---------------------------------------------------------------------------

  it("5. `txId` is NOT generic artifact identity — readArtifact(txId) rejects even when a receipt on disk carries .txId === input", async () => {
    const plan = makePlan();
    const receiptTxId = "dc228d614488471f0804f368e8ddee605c9993624bf17b6805688df214ca32aa";
    const receipt = createSimulatedTxReceipt(plan, receiptTxId, ctx, { daaScore: "1" });
    await writeJson(path.join(artifactsDir, "receipts", `txReceipt-${receipt.contentHash}.json`), receipt);

    await expect(store.exists(receiptTxId)).resolves.toBe(false);
    expect(await codeOf(store.readArtifact(receiptTxId))).toBe("ARTIFACT_NOT_FOUND");
  });

  it("6/7. an artifact without lineage (snapshot) is identity-resolvable by its recomputed contentHash AND path-resolvable", async () => {
    // Wave 5/11 kept contentHash-only artifacts path-resolvable only. IC-5′.1 (identity
    // by category, AUD-45) makes the recomputed contentHash the identity of every artifact.
    const snapshot: any = {
      schema: "hardkas.snapshot.v1",
      hardkasVersion: "0.12.0-rc.23",
      version: "1.0.0-alpha",
      hashVersion: CURRENT_HASH_VERSION,
      networkId: "simnet",
      mode: "simulator",
      createdAt: "2026-09-25T00:00:00.000Z",
      daaScore: "1",
      accounts: [],
      utxos: []
    };
    snapshot.contentHash = calculateContentHash(snapshot, CURRENT_HASH_VERSION);
    const snapshotPath = path.join(artifactsDir, "misc", `snapshot-${snapshot.contentHash}.json`);
    await writeJson(snapshotPath, snapshot);

    await expect(store.exists(snapshot.contentHash)).resolves.toBe(true);
    expect(((await store.readArtifact(snapshot.contentHash)) as any).contentHash).toBe(snapshot.contentHash);
    expect(((await store.readArtifact(snapshotPath)) as any).contentHash).toBe(snapshot.contentHash);
  });

  // ---------------------------------------------------------------------------
  // Upstream contracts kept.
  // ---------------------------------------------------------------------------

  it("8. `findReceiptByTxId(realTxId)` succeeds — the receipt-specific lookup owns the txId namespace", async () => {
    const plan = makePlan();
    const realTxId = "dc228d614488471f0804f368e8ddee605c9993624bf17b6805688df214ca32aa";
    const receipt = createSimulatedTxReceipt(plan, realTxId, ctx, { daaScore: "1" });
    await writeJson(path.join(artifactsDir, "receipts", `txReceipt-${receipt.contentHash}.json`), receipt);

    const found = (await store.findReceiptByTxId(realTxId)) as { txId: string; contentHash: string };
    expect(found.txId).toBe(realTxId);
    expect(found.contentHash).toBe(receipt.contentHash);
  });

  it("8b. `findReceiptByTxId(unknownTxId)` throws typed RECEIPT_NOT_FOUND", async () => {
    await expect(store.findReceiptByTxId("0".repeat(64))).rejects.toBeInstanceOf(ReceiptLookupError);
    expect(await codeOf(store.findReceiptByTxId("0".repeat(64)))).toBe("RECEIPT_NOT_FOUND");
  });

  it("9. the tx namespace replaces the speculative `readArtifact(txId)` + enumerate-fallback pattern", async () => {
    const plan = makePlan();
    const txId = "aaaaaaaa0000000000000000000000000000000000000000000000000000aaaa";
    const receipt = createSimulatedTxReceipt(plan, txId, ctx, { daaScore: "1" });
    await writeJson(path.join(artifactsDir, "receipts", `txReceipt-${receipt.contentHash}.json`), receipt);

    // Generic reader: a 64-hex txId is read as an artifactId and is not found.
    expect(await codeOf(store.readArtifact(txId))).toBe("ARTIFACT_NOT_FOUND");
    // Typed namespace: verified receipt.
    const r = await resolveArtifact(ws, { tx: txId });
    expect(r.artifact.txId).toBe(txId);
    expect(r.artifactId).toBe(receipt.contentHash);
  });

  // ---------------------------------------------------------------------------
  // Failure-mode surfaces preserved.
  // ---------------------------------------------------------------------------

  it("does not treat corrupt JSON as a match, even when its filename contains the label", async () => {
    const plan = makePlan();
    await fs.mkdir(path.join(artifactsDir, "plans"), { recursive: true });
    await fs.writeFile(path.join(artifactsDir, "plans", `txPlan-${plan.planId}.json`), "{ this is not valid JSON", "utf-8");

    expect(await codeOf(resolveArtifact(ws, { plan: plan.planId }))).toBe("ARTIFACT_NOT_FOUND");
    expect(await codeOf(store.readArtifact(plan.contentHash))).toBe("ARTIFACT_NOT_FOUND");
  });

  it("does not treat a directory whose name contains the label as an artifact", async () => {
    const plan = makePlan();
    await fs.mkdir(path.join(artifactsDir, "plans", `wrap-${plan.planId}-dir`), { recursive: true });
    expect(await codeOf(resolveArtifact(ws, { plan: plan.planId }))).toBe("ARTIFACT_NOT_FOUND");
    expect(await codeOf(store.readArtifact(plan.contentHash))).toBe("ARTIFACT_NOT_FOUND");
  });

  it("returns not-found for a genuinely missing artifact even when a neighbour's filename contains the queried label", async () => {
    const other = makePlan();
    await writeJson(path.join(artifactsDir, "plans", `txPlan-plan-missing-neighbour.json`), other);
    expect(await codeOf(resolveArtifact(ws, { plan: "plan-missing" }))).toBe("ARTIFACT_NOT_FOUND");
    expect(await codeOf(store.readArtifact("0".repeat(64)))).toBe("ARTIFACT_NOT_FOUND");
  });
});
