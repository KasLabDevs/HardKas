import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ProjectArtifactStore } from "../src/store.js";
import { ReceiptLookupError } from "../src/receipt-lookup-error.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "../src/canonical.js";

// -----------------------------------------------------------------------------
// Wave 10 · RECEIPT-1 · Exact receipt lookup by .txId · regression matrix,
// re-based on the rc.23 remediation Wave 1.2 contract (Closure Pack IC-5′):
//
//   - Recognises L1 receipt schemas: "hardkas.txReceipt" and
//     "hardkas.txReceipt.v1" (from `.schema`, or `.schemaVersion` for the
//     simulator's failure writer). Igra / L2 receipts are OUT of scope.
//   - Compares `.txId` byte-for-byte (no normalisation, no hex-shape
//     enforcement — simulator-failure ids must still be resolvable).
//   - EVERY candidate is verified before it is returned (declared hash
//     version, claimed identity); an invalid candidate FAILS the lookup with
//     `CANDIDATE_INVALID` instead of being skipped or collapsed (IC-5′.4).
//   - Zero matches → typed `RECEIPT_NOT_FOUND`.
//   - Identical copies collapse; distinct verified receipts for one txId →
//     `RECEIPT_AMBIGUOUS_CONFLICT` (IC-5′.5).
//   - artifactId is never treated as txId; non-receipt schemas are excluded.
// -----------------------------------------------------------------------------

const REAL_TX_ID = "dc228d614488471f0804f368e8ddee605c9993624bf17b6805688df214ca32aa";
const SIM_TX_ID_HEX = "1111111122222222333333334444444455555555666666667777777788888888";
const SIM_TX_ID_FAILED = "simtx_failed_38661afb6b4652ad031ba1c8a1f84125";

/** Seals a receipt-shaped draft under the current hash version. */
function sealed(fields: Record<string, unknown>): any {
  const a: any = { schema: "hardkas.txReceipt", hashVersion: CURRENT_HASH_VERSION, ...fields };
  a.contentHash = calculateContentHash(a, CURRENT_HASH_VERSION);
  if (a.lineage) a.lineage.artifactId = a.contentHash;
  return a;
}

async function writeJson(p: string, obj: any) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj), "utf-8");
}

async function makeWorkspace(): Promise<{ ws: string; artifactsDir: string }> {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), "hk-wave10-receipt-"));
  const artifactsDir = path.join(ws, ".hardkas", "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });
  return { ws, artifactsDir };
}

describe("Wave 10 · RECEIPT-1 · findReceiptByTxId exact lookup (IC-5′ re-base)", () => {
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

  it("1. resolves a real-node canonical receipt by real Kaspa txId", async () => {
    const receipt = sealed({ txId: REAL_TX_ID, mode: "localnet", networkId: "simnet", lineage: { artifactId: "", parentArtifactId: "", sequence: 3 } });
    await writeJson(path.join(artifactsDir, "receipts", `txReceipt-${receipt.contentHash}.json`), receipt);

    const found: any = await store.findReceiptByTxId(REAL_TX_ID);
    expect(found.txId).toBe(REAL_TX_ID);
    expect(found.contentHash).toBe(receipt.contentHash);
    expect(found.schema).toBe("hardkas.txReceipt");
  });

  it("2. resolves a simulator receipt written with .schemaVersion (v1) by txId", async () => {
    // Simulator failure writer (packages/localnet/src/transactions.ts) populates
    // `schemaVersion`; a legacy copy without `schema` must still be a receipt.
    const receipt: any = { schemaVersion: "hardkas.txReceipt.v1", hashVersion: CURRENT_HASH_VERSION, txId: SIM_TX_ID_HEX, mode: "simulator", status: "confirmed" };
    receipt.contentHash = calculateContentHash(receipt, CURRENT_HASH_VERSION);
    await writeJson(path.join(artifactsDir, "receipts", `txReceipt-${SIM_TX_ID_HEX}.json`), receipt);

    const found: any = await store.findReceiptByTxId(SIM_TX_ID_HEX);
    expect(found.txId).toBe(SIM_TX_ID_HEX);
  });

  it("3. does NOT accidentally return a receipt when queried by its artifactId", async () => {
    const receipt = sealed({ txId: REAL_TX_ID, lineage: { artifactId: "", parentArtifactId: "", sequence: 3 } });
    await writeJson(path.join(artifactsDir, "receipts", `txReceipt-${receipt.contentHash}.json`), receipt);

    await expect(store.findReceiptByTxId(receipt.contentHash)).rejects.toMatchObject({
      name: "ReceiptLookupError",
      code: "RECEIPT_NOT_FOUND"
    });
  });

  it("4. missing txId throws RECEIPT_NOT_FOUND (typed)", async () => {
    const receipt = sealed({ txId: REAL_TX_ID, lineage: { artifactId: "", parentArtifactId: "", sequence: 3 } });
    await writeJson(path.join(artifactsDir, "receipts", `txReceipt-${receipt.contentHash}.json`), receipt);

    let caught: unknown;
    try {
      await store.findReceiptByTxId("f".repeat(64));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ReceiptLookupError);
    expect((caught as any).code).toBe("RECEIPT_NOT_FOUND");
  });

  it("5. duplicate copies of the same verified receipt collapse cleanly", async () => {
    const shared = sealed({ txId: REAL_TX_ID, lineage: { artifactId: "", parentArtifactId: "", sequence: 3 } });
    await writeJson(path.join(artifactsDir, "receipts", `txReceipt-${shared.contentHash}.json`), shared);
    await writeJson(path.join(artifactsDir, "misc", `dup-copy-${shared.contentHash}.json`), shared);

    const found: any = await store.findReceiptByTxId(REAL_TX_ID);
    expect(found.txId).toBe(REAL_TX_ID);
    expect(found.contentHash).toBe(shared.contentHash);
  });

  it("6. conflicting verified receipts with the same txId and DIFFERENT identity throw RECEIPT_AMBIGUOUS_CONFLICT", async () => {
    const one = sealed({ txId: REAL_TX_ID, daaScore: "1", lineage: { artifactId: "", parentArtifactId: "", sequence: 3 } });
    const two = sealed({ txId: REAL_TX_ID, daaScore: "2", lineage: { artifactId: "", parentArtifactId: "", sequence: 3 } });
    expect(one.contentHash).not.toBe(two.contentHash);
    await writeJson(path.join(artifactsDir, "receipts", `txReceipt-${one.contentHash}.json`), one);
    await writeJson(path.join(artifactsDir, "receipts", `txReceipt-${two.contentHash}.json`), two);

    await expect(store.findReceiptByTxId(REAL_TX_ID)).rejects.toMatchObject({
      name: "ReceiptLookupError",
      code: "RECEIPT_AMBIGUOUS_CONFLICT"
    });
  });

  it("7. non-receipt artifact with matching .txId is excluded by schema filter", async () => {
    const signed = sealed({ schema: "hardkas.signedTx", txId: REAL_TX_ID, lineage: { artifactId: "", parentArtifactId: "", sequence: 2 } });
    signed.signedId = `signed-${signed.contentHash.slice(0, 16)}`;
    await writeJson(path.join(artifactsDir, "signed", `signedTx-abc.json`), signed);

    await expect(store.findReceiptByTxId(REAL_TX_ID)).rejects.toMatchObject({
      name: "ReceiptLookupError",
      code: "RECEIPT_NOT_FOUND"
    });
  });

  it("8. simulator-failure txId marker (simtx_failed_*) is resolvable — no hex-shape enforcement", async () => {
    const receipt = sealed({ txId: SIM_TX_ID_FAILED, mode: "simulator", status: "failed" });
    await writeJson(path.join(artifactsDir, "receipts", `txReceipt-simfail.json`), receipt);

    const found: any = await store.findReceiptByTxId(SIM_TX_ID_FAILED);
    expect(found.txId).toBe(SIM_TX_ID_FAILED);
  });

  it("9. L2 Igra receipt with matching .txId is NOT resolved (L1-only scope)", async () => {
    await writeJson(path.join(artifactsDir, "receipts", `igra-receipt.json`), {
      schema: "hardkas.igraTxReceipt.v1",
      contentHash: "igra-content-9",
      txId: REAL_TX_ID // same lexical form; different chain
    });

    await expect(store.findReceiptByTxId(REAL_TX_ID)).rejects.toMatchObject({
      name: "ReceiptLookupError",
      code: "RECEIPT_NOT_FOUND"
    });
  });

  it("10. a candidate that does not verify (no contentHash) fails the lookup closed with CANDIDATE_INVALID", async () => {
    // Wave 10 classified this as ambiguity; IC-5′.4 makes an invalid candidate a
    // hard failure of the lookup (never skipped, never collapsed).
    const valid = sealed({ txId: REAL_TX_ID });
    await writeJson(path.join(artifactsDir, "receipts", `txReceipt-${valid.contentHash}.json`), valid);
    await writeJson(path.join(artifactsDir, "misc", "no-content-hash.json"), {
      schema: "hardkas.txReceipt",
      hashVersion: CURRENT_HASH_VERSION,
      // contentHash deliberately absent
      txId: REAL_TX_ID
    });

    let caught: unknown;
    try {
      await store.findReceiptByTxId(REAL_TX_ID);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ReceiptLookupError);
    expect((caught as any).code).toBe("CANDIDATE_INVALID");
    // Sanity: context should surface the offender for diagnosis.
    expect(String((caught as any).context?.paths ?? "")).toContain("no-content-hash.json");
  });

  it("11. exact Wave 4 real-node receipt shape (hashVersion 4) resolves in bounded time with LEGACY scope", async () => {
    const receipt: any = {
      schema: "hardkas.txReceipt",
      hardkasVersion: "0.12.0-rc.23",
      version: "1.0.0-alpha",
      hashVersion: 4,
      networkId: "simnet",
      mode: "localnet",
      createdAt: "2026-09-19T20:04:48.356Z",
      status: "submitted",
      txId: REAL_TX_ID,
      sourceSignedId: "signed-b66b90960d165c10",
      from: { address: "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn" },
      to: { address: "kaspasim:qryj23rch0n5rc7klfug58zcrnuc966qljwgzpu3mflqgxu6w2pjg6n575980" },
      amountSompi: "1000000000",
      feeSompi: "0",
      submittedAt: "2026-09-19T20:04:48.356Z",
      rpcUrl: "ws://127.0.0.1:18210",
      lineage: {
        artifactId: "",
        lineageId: "3fcedcb32121930a9ce46060ed528ddbbef5f2c4d3e13b6e520d28a33fcc85d4",
        parentArtifactId: "b66b90960d165c1026fdb68342b86f72883acd19cd3e2e22f94f57be3d91603c",
        rootArtifactId: "3fcedcb32121930a9ce46060ed528ddbbef5f2c4d3e13b6e520d28a33fcc85d4",
        sequence: 3
      }
    };
    // Explicit rc.22 legacy fixture: sealed under v4 (identity fields name-excluded).
    receipt.contentHash = calculateContentHash(receipt, 4);
    receipt.lineage.artifactId = receipt.contentHash;
    await writeJson(path.join(artifactsDir, "receipts", `txReceipt-${receipt.contentHash}.json`), receipt);

    const t0 = Date.now();
    const found: any = await store.findReceiptByTxId(REAL_TX_ID);
    const elapsedMs = Date.now() - t0;

    expect(found.txId).toBe(REAL_TX_ID);
    expect(found.contentHash).toBe(receipt.contentHash);
    expect(found.mode).toBe("localnet");
    expect(found.preStateHash).toBeUndefined();
    expect(elapsedMs).toBeLessThan(2000);
  });

  it("12. throws ReceiptLookupError instances (typed, not plain Error)", async () => {
    let caught: unknown;
    try {
      await store.findReceiptByTxId("nonexistent-txid");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ReceiptLookupError);
    expect(caught).not.toBeInstanceOf(TypeError);
  });
});
