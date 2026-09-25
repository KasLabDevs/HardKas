import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ProjectArtifactStore } from "../src/store.js";
import { ReceiptLookupError } from "../src/receipt-lookup-error.js";

// -----------------------------------------------------------------------------
// Wave 11 · RESOLVER-1 · content-verified id resolution with STRICT namespace
// separation.
//
// The Wave 11 correction has TWO parts:
//
//   (1) close the silent wrong-artifact selection by verifying the queried id
//       against the artifact's parsed content, not just its filename;
//
//   (2) narrow the accepted "generic artifact identity" namespaces to
//       exactly those with an existing contract:
//
//         - `artifact.lineage.artifactId` — canonical (Wave 5).
//         - `artifact.planId`             — legacy short-ID (proven by
//                                           store-root-resolution.test.ts).
//
//       DELIBERATELY EXCLUDED as generic artifact identity, because previous
//       waves separated them into their own namespaces:
//
//         - `contentHash` — Wave 5: contentHash is NOT guaranteed to equal
//           artifactId. contentHash-only artifacts (snapshots) are
//           path-resolvable, never identity-resolvable.
//         - `txId`        — Wave 10: Kaspa consensus txId lookup lives in
//           `findReceiptByTxId`. Generic `readArtifact(txId)` must NOT
//           succeed just because a receipt happens to carry `.txId === input`.
//         - `signedId`, `receiptId` — no existing contract evidence supports
//           either as a `readArtifact` / `exists` input.
//         - Top-level `.artifactId` — Wave 5 recognises only
//           `lineage.artifactId` as canonical.
//
// The invariant Wave 11 locks:
//
//     A generic artifact lookup cannot silently cross identity namespaces.
//     artifactId ≠ txId ≠ contentHash unless the schema explicitly defines
//     equality, and value coincidence in one artifact does NOT make the
//     namespaces interchangeable.
// -----------------------------------------------------------------------------

async function writeJson(p: string, obj: unknown): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj), "utf-8");
}

describe("Wave 11 · RESOLVER-1 · content-verified findArtifactPathById", () => {
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
  // Positive contracts — canonical + legacy identities that DO resolve.
  // ---------------------------------------------------------------------------

  it("1. resolves a plan by full 64-hex canonical artifactId (lineage.artifactId, filename carries only 16-hex short form)", async () => {
    // Wave 4 / Wave 6 fixture shape: filename embeds 16-hex, canonical
    // identity lives in `lineage.artifactId`.
    const fullId =
      "aaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbccccccccccccccccdddddddddddddddd";
    const shortForm = fullId.slice(0, 16);
    await writeJson(
      path.join(artifactsDir, `2026-01-01-plan-${shortForm}.plan.json`),
      {
        schema: "hardkas.txPlan",
        planId: `plan-${shortForm}`,
        contentHash: fullId,
        lineage: { artifactId: fullId, parentArtifactId: "", sequence: 1 }
      }
    );

    await expect(store.exists(fullId)).resolves.toBe(true);
    const read = (await store.readArtifact(fullId)) as {
      lineage: { artifactId: string };
    };
    expect(read.lineage.artifactId).toBe(fullId);
  });

  it("3. resolves a plan by its short-form planId — the one legacy short-ID contract", async () => {
    const planId = "plan-abcdef0123456789";
    await writeJson(
      path.join(artifactsDir, "plans", `txPlan-${planId}.json`),
      {
        schema: "hardkas.txPlan",
        planId,
        contentHash: "hash-abcdef0123456789"
      }
    );

    await expect(store.exists(planId)).resolves.toBe(true);
    const read = (await store.readArtifact(planId)) as { planId: string };
    expect(read.planId).toBe(planId);
  });

  it("10. lineage parent lookup by full canonical artifactId still resolves after Wave 11 narrowing", async () => {
    // The Wave 6 lineage walker calls readArtifact(parentArtifactId) where
    // parentArtifactId is the parent's canonical `lineage.artifactId`. That
    // path must survive the Wave 11 narrowing verbatim.
    const parentId =
      "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff";
    const parentShort = parentId.slice(0, 16);
    await writeJson(
      path.join(artifactsDir, `2026-02-02-plan-${parentShort}.plan.json`),
      {
        schema: "hardkas.txPlan",
        planId: `plan-${parentShort}`,
        contentHash: parentId,
        lineage: { artifactId: parentId, parentArtifactId: "", sequence: 1 }
      }
    );

    const parent = (await store.readArtifact(parentId)) as {
      lineage: { artifactId: string };
    };
    expect(parent.lineage.artifactId).toBe(parentId);
  });

  // ---------------------------------------------------------------------------
  // Collision closures — filename-substring false positives never win.
  // ---------------------------------------------------------------------------

  it("2. does NOT return artifact Y when Y's filename shares Y's short id with the queried A's first-16-hex — canonical identity is authoritative", async () => {
    const sharedPrefix = "0123456789abcdef";
    const idA =
      sharedPrefix + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const idY =
      sharedPrefix + "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy";
    expect(idA.length).toBe(64);
    expect(idY.length).toBe(64);
    expect(idA).not.toBe(idY);

    await writeJson(
      path.join(
        artifactsDir,
        "signed",
        `signedTx-${sharedPrefix}yyyyyyyyyyyyyyyy.json`
      ),
      {
        schema: "hardkas.signedTx",
        signedId: `signed-${sharedPrefix}yyyyyyyyyyyyyyyy`,
        contentHash: idY,
        lineage: { artifactId: idY, parentArtifactId: "", sequence: 1 }
      }
    );

    await expect(store.exists(idA)).resolves.toBe(false);
    await expect(store.readArtifact(idA)).rejects.toThrow(/not found in store/);
  });

  it("does NOT return the wrong artifact when a short id is a prefix of another artifact's planId", async () => {
    const shortA = "plan-abcd";
    const longB = "plan-abcdef1234";
    await writeJson(path.join(artifactsDir, "plans", `txPlan-${longB}.json`), {
      schema: "hardkas.txPlan",
      planId: longB,
      contentHash: "hash-only-for-B"
    });

    await expect(store.exists(shortA)).resolves.toBe(false);
    await expect(store.readArtifact(shortA)).rejects.toThrow(
      /not found in store/
    );
  });

  it("selects the content-verified planId match past a filename-only false-positive impostor", async () => {
    const targetId = "plan-target1234";
    const impostorId = "plan-target1234-longer";

    await writeJson(
      path.join(artifactsDir, "plans", `aaa-txPlan-${impostorId}.json`),
      {
        schema: "hardkas.txPlan",
        planId: impostorId,
        contentHash: "hash-impostor"
      }
    );
    await writeJson(
      path.join(artifactsDir, "plans", `zzz-txPlan-${targetId}.json`),
      {
        schema: "hardkas.txPlan",
        planId: targetId,
        contentHash: "hash-target"
      }
    );

    const read = (await store.readArtifact(targetId)) as {
      planId: string;
      contentHash: string;
    };
    expect(read.planId).toBe(targetId);
    expect(read.contentHash).toBe("hash-target");
  });

  it("keeps preferring a canonical subdirectory over the artifacts root when two files legitimately declare the same planId", async () => {
    const planId = "plan-duplicate-legit";
    await writeJson(
      path.join(artifactsDir, "plans", `txPlan-${planId}.json`),
      {
        schema: "hardkas.txPlan",
        planId,
        contentHash: "hash-from-plans-dir"
      }
    );
    await writeJson(
      path.join(artifactsDir, `2020-01-01-${planId}.plan.json`),
      {
        schema: "hardkas.txPlan",
        planId,
        contentHash: "hash-from-root"
      }
    );

    const read = (await store.readArtifact(planId)) as { contentHash: string };
    expect(read.contentHash).toBe("hash-from-plans-dir");
  });

  it("4. arbitrary partial ID does not resolve (neither prefix nor infix of any canonical/planId slot)", async () => {
    const canonicalId =
      "eeeeeeeeeeeeeeeeffffffffffffffff0000000000000000eeeeeeeeeeeeeeee";
    await writeJson(
      path.join(
        artifactsDir,
        "plans",
        `txPlan-plan-${canonicalId.slice(0, 16)}.json`
      ),
      {
        schema: "hardkas.txPlan",
        planId: `plan-${canonicalId.slice(0, 16)}`,
        contentHash: canonicalId,
        lineage: { artifactId: canonicalId, parentArtifactId: "", sequence: 1 }
      }
    );

    // Partial forms that are neither the full canonical id nor the exact planId:
    for (const partial of [
      canonicalId.slice(0, 16), // 16-hex prefix (also happens to be part of planId text but not the planId itself)
      canonicalId.slice(0, 32),
      "plan-eeee", // shorter than the real planId
      canonicalId + "extra" // longer
    ]) {
      await expect(store.exists(partial)).resolves.toBe(false);
      await expect(store.readArtifact(partial)).rejects.toThrow(
        /not found in store/
      );
    }
  });

  // ---------------------------------------------------------------------------
  // Namespace separation — the invariant Wave 11 locks.
  // ---------------------------------------------------------------------------

  it("5. `txId` is NOT generic artifact identity — readArtifact(txId) rejects even when a receipt on disk carries .txId === input", async () => {
    const receiptTxId =
      "dc228d614488471f0804f368e8ddee605c9993624bf17b6805688df214ca32aa";
    const receiptCanonicalArtifactId =
      "c07596a5ac21ca4a746a1da21589e5e5b88dcb298985fe733b3549184d92f48b";

    await writeJson(
      path.join(
        artifactsDir,
        "receipts",
        `txReceipt-${receiptCanonicalArtifactId}.json`
      ),
      {
        schema: "hardkas.txReceipt",
        contentHash: receiptCanonicalArtifactId,
        txId: receiptTxId,
        lineage: {
          artifactId: receiptCanonicalArtifactId,
          parentArtifactId: "",
          sequence: 3
        }
      }
    );

    // Generic reader must NOT resolve by txId — that namespace belongs to
    // findReceiptByTxId.
    await expect(store.exists(receiptTxId)).resolves.toBe(false);
    await expect(store.readArtifact(receiptTxId)).rejects.toThrow(
      /not found in store/
    );
  });

  it("6. `contentHash` alone is NOT generic artifact identity — readArtifact(contentHash) rejects when no lineage.artifactId matches", async () => {
    // Snapshot-shaped fixture: contentHash present, but the value we look up
    // exists ONLY as `contentHash`, not as `lineage.artifactId` and not as
    // `planId`. Wave 5's façade explicitly documents this as "not
    // ID-resolvable" (path-resolvable only).
    const onlyContentHash =
      "1111111122222222333333334444444455555555666666667777777788888888";
    await writeJson(
      path.join(artifactsDir, "misc", `snapshot-${onlyContentHash}.json`),
      {
        schema: "hardkas.snapshot.v1",
        contentHash: onlyContentHash
        // deliberately: no lineage.artifactId, no planId
      }
    );

    await expect(store.exists(onlyContentHash)).resolves.toBe(false);
    await expect(store.readArtifact(onlyContentHash)).rejects.toThrow(
      /not found in store/
    );
  });

  it("7. snapshot with contentHash but no artifactId is path-resolvable only, not identity-resolvable", async () => {
    // Same shape as #6, but here we prove the workspace-relative PATH input
    // still works — so the file itself is accessible, just not through the
    // id namespace.
    const snapshotHash =
      "9999999988888888777777776666666655555555444444443333333322222222";
    const snapshotPath = path.join(
      artifactsDir,
      "misc",
      `snapshot-${snapshotHash}.json`
    );
    await writeJson(snapshotPath, {
      schema: "hardkas.snapshot.v1",
      contentHash: snapshotHash
    });

    // id form rejects
    await expect(store.readArtifact(snapshotHash)).rejects.toThrow(
      /not found in store/
    );

    // path form resolves — readArtifact accepts absolute paths inside the
    // workspace.
    const read = (await store.readArtifact(snapshotPath)) as {
      contentHash: string;
    };
    expect(read.contentHash).toBe(snapshotHash);
  });

  // ---------------------------------------------------------------------------
  // Upstream contracts Wave 11 must not have broken.
  // ---------------------------------------------------------------------------

  it("8. Wave 10 `findReceiptByTxId(realTxId)` still succeeds — the receipt-specific lookup owns the txId namespace", async () => {
    const realTxId =
      "dc228d614488471f0804f368e8ddee605c9993624bf17b6805688df214ca32aa";
    const receiptCanonicalId =
      "c07596a5ac21ca4a746a1da21589e5e5b88dcb298985fe733b3549184d92f48b";

    await writeJson(
      path.join(
        artifactsDir,
        "receipts",
        `txReceipt-${receiptCanonicalId}.json`
      ),
      {
        schema: "hardkas.txReceipt",
        contentHash: receiptCanonicalId,
        txId: realTxId,
        sourceSignedId: "signed-source-token",
        lineage: {
          artifactId: receiptCanonicalId,
          parentArtifactId: "",
          sequence: 3
        }
      }
    );

    const receipt = (await store.findReceiptByTxId(realTxId)) as {
      txId: string;
      contentHash: string;
    };
    expect(receipt.txId).toBe(realTxId);
    expect(receipt.contentHash).toBe(receiptCanonicalId);
  });

  it("8b. Wave 10 `findReceiptByTxId(unknownTxId)` still throws typed RECEIPT_NOT_FOUND", async () => {
    // No receipts on disk; just prove the typed error still propagates.
    await expect(
      store.findReceiptByTxId(
        "0000000000000000000000000000000000000000000000000000000000000000"
      )
    ).rejects.toBeInstanceOf(ReceiptLookupError);
  });

  it("9. `loadSimulatedReceipt`-style speculative `readArtifact(txId)` + enumerate-fallback pattern still finds the receipt", async () => {
    // Reproduces the exact resilience pattern at
    // packages/localnet/src/receipts.ts::loadSimulatedReceipt:
    //
    //   1. try store.readArtifact(txId) speculatively (may throw post-Wave-11);
    //   2. if that fails, enumerate receipts via queryArtifacts and pick the
    //      one whose .txId equals the input.
    //
    // Wave 11 makes step 1 fail for a receipt whose only `.txId === input`
    // link is the txId slot — that is the intentional namespace separation.
    // The consumer contract is that step 2 (the fallback) succeeds. This
    // test locks that end-to-end behaviour.
    const txId =
      "aaaaaaaa0000000000000000000000000000000000000000000000000000aaaa";
    const receiptCanonicalId =
      "bbbbbbbb0000000000000000000000000000000000000000000000000000bbbb";

    await writeJson(
      path.join(
        artifactsDir,
        "receipts",
        `txReceipt-${receiptCanonicalId}.json`
      ),
      {
        schema: "hardkas.txReceipt",
        contentHash: receiptCanonicalId,
        txId,
        lineage: {
          artifactId: receiptCanonicalId,
          parentArtifactId: "",
          sequence: 3
        }
      }
    );

    // Step 1 — speculative readArtifact(txId) — must NOT resolve post-Wave-11.
    let step1Succeeded = false;
    try {
      const direct: any = await store.readArtifact(txId);
      if (direct && direct.txId === txId) step1Succeeded = true;
    } catch {
      // expected under Wave 11 namespace separation
    }
    expect(step1Succeeded).toBe(false);

    // Step 2 — enumerate + filter, exactly as loadSimulatedReceipt does.
    const receipts = await store.queryArtifacts({
      schema: "hardkas.txReceipt"
    });
    const found = receipts.find((a: any) => a.txId === txId);
    expect(found).toBeDefined();
    expect((found as any).txId).toBe(txId);
    expect((found as any).contentHash).toBe(receiptCanonicalId);
  });

  // ---------------------------------------------------------------------------
  // Failure-mode surfaces preserved.
  // ---------------------------------------------------------------------------

  it("does not treat corrupt JSON as a match, even when its filename contains the id", async () => {
    const planId = "plan-corrupt-neighbour";
    await fs.mkdir(path.join(artifactsDir, "plans"), { recursive: true });
    await fs.writeFile(
      path.join(artifactsDir, "plans", `txPlan-${planId}.json`),
      "{ this is not valid JSON",
      "utf-8"
    );

    await expect(store.exists(planId)).resolves.toBe(false);
    await expect(store.readArtifact(planId)).rejects.toThrow();
  });

  it("does not treat a directory whose name contains the id as an artifact", async () => {
    const planId = "plan-dir-decoy";
    await fs.mkdir(path.join(artifactsDir, "plans", `wrap-${planId}-dir`), {
      recursive: true
    });

    await expect(store.exists(planId)).resolves.toBe(false);
    await expect(store.readArtifact(planId)).rejects.toThrow(
      /not found in store/
    );
  });

  it("returns not-found for a genuinely missing artifact even when a neighbour's filename contains the queried id", async () => {
    await writeJson(
      path.join(artifactsDir, "plans", "txPlan-plan-other.json"),
      { schema: "hardkas.txPlan", planId: "plan-other", contentHash: "hash-o" }
    );

    await expect(store.exists("plan-missing")).resolves.toBe(false);
    await expect(store.readArtifact("plan-missing")).rejects.toThrow(
      /not found in store/
    );
  });
});
