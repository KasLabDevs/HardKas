import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ProjectArtifactStore } from "../src/store.js";
import { ReceiptLookupError } from "../src/receipt-lookup-error.js";

// -----------------------------------------------------------------------------
// Wave 10 · RECEIPT-1 · Exact receipt lookup by .txId · regression matrix.
//
// Contract enforced (see store.ts `findReceiptByTxId`):
//
//   - Recognises L1 receipt schemas: "hardkas.txReceipt" and
//     "hardkas.txReceipt.v1". Igra / L2 receipts are OUT of scope.
//   - Accepts the schema tag from either `.schema` or `.schemaVersion`
//     (real-node vs simulator writer inconsistency).
//   - Compares `.txId` byte-for-byte (no normalisation, no hex-shape
//     enforcement — simulator-failure ids and any future non-hex form
//     must still be resolvable).
//   - Zero matches → typed `RECEIPT_NOT_FOUND`.
//   - Exactly one match → return the artifact.
//   - Multiple matches → collapse ONLY if all carry a non-empty and
//     identical `.contentHash`; any missing/empty hash forces
//     `RECEIPT_AMBIGUOUS_CONFLICT` (no undefined-equality collapse).
//   - artifactId is never accidentally treated as txId (no substring
//     fallback — the resolver enumerates and filters exactly).
//   - Non-receipt schemas that happen to carry a `.txId` field are
//     excluded by the schema filter.
// -----------------------------------------------------------------------------

const REAL_TX_ID =
  "dc228d614488471f0804f368e8ddee605c9993624bf17b6805688df214ca32aa";
const REAL_ARTIFACT_ID =
  "c07596a5ac21ca4a746a1da21589e5e5b88dcb298985fe733b3549184d92f48b";
const SIM_TX_ID_HEX =
  "1111111122222222333333334444444455555555666666667777777788888888";
const SIM_TX_ID_FAILED = "simtx_failed_38661afb6b4652ad031ba1c8a1f84125";

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

describe("Wave 10 · RECEIPT-1 · findReceiptByTxId exact lookup", () => {
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
  // 1 · real-node canonical receipt lookup by real txId (headline case)
  // ---------------------------------------------------------------------------

  it("1. resolves a real-node canonical receipt by real Kaspa txId", async () => {
    const receiptPath = path.join(
      artifactsDir,
      "receipts",
      `txReceipt-${REAL_ARTIFACT_ID}.json`
    );
    await writeJson(receiptPath, {
      schema: "hardkas.txReceipt", // real-node canonical
      contentHash: REAL_ARTIFACT_ID,
      txId: REAL_TX_ID,
      mode: "localnet",
      networkId: "simnet",
      lineage: {
        artifactId: REAL_ARTIFACT_ID,
        parentArtifactId: "",
        sequence: 3
      }
    });

    const receipt: any = await store.findReceiptByTxId(REAL_TX_ID);
    expect(receipt.txId).toBe(REAL_TX_ID);
    expect(receipt.contentHash).toBe(REAL_ARTIFACT_ID);
    expect(receipt.schema).toBe("hardkas.txReceipt");
  });

  // ---------------------------------------------------------------------------
  // 2 · simulator receipt via .schemaVersion writer path
  // ---------------------------------------------------------------------------

  it("2. resolves a simulator receipt written with .schemaVersion (v1) by txId", async () => {
    const receiptPath = path.join(
      artifactsDir,
      "receipts",
      `txReceipt-${SIM_TX_ID_HEX}.json`
    );
    await writeJson(receiptPath, {
      // Simulator writer path (packages/localnet/src/transactions.ts:234)
      // populates `schemaVersion` instead of `schema`.
      schemaVersion: "hardkas.txReceipt.v1",
      txId: SIM_TX_ID_HEX,
      contentHash: "sim-content-hash-2",
      mode: "simulator",
      status: "confirmed"
    });

    const receipt: any = await store.findReceiptByTxId(SIM_TX_ID_HEX);
    expect(receipt.txId).toBe(SIM_TX_ID_HEX);
  });

  // ---------------------------------------------------------------------------
  // 3 · artifactId is NOT accidentally treated as txId
  // ---------------------------------------------------------------------------

  it("3. does NOT accidentally return a receipt when queried by its artifactId", async () => {
    // Same fixture as test 1: artifactId is a substring of the filename,
    // pre-Wave-10 the store's substring resolver would have returned this
    // receipt when queried by artifactId. Post-Wave-10 the filter checks
    // `.txId === input` exactly — artifactId is NOT a txId, so lookup fails.
    const receiptPath = path.join(
      artifactsDir,
      "receipts",
      `txReceipt-${REAL_ARTIFACT_ID}.json`
    );
    await writeJson(receiptPath, {
      schema: "hardkas.txReceipt",
      contentHash: REAL_ARTIFACT_ID,
      txId: REAL_TX_ID,
      lineage: { artifactId: REAL_ARTIFACT_ID, parentArtifactId: "", sequence: 3 }
    });

    await expect(
      store.findReceiptByTxId(REAL_ARTIFACT_ID)
    ).rejects.toMatchObject({
      name: "ReceiptLookupError",
      code: "RECEIPT_NOT_FOUND"
    });
  });

  // ---------------------------------------------------------------------------
  // 4 · missing txId — typed RECEIPT_NOT_FOUND
  // ---------------------------------------------------------------------------

  it("4. missing txId throws RECEIPT_NOT_FOUND (typed)", async () => {
    const receiptPath = path.join(
      artifactsDir,
      "receipts",
      `txReceipt-${REAL_ARTIFACT_ID}.json`
    );
    await writeJson(receiptPath, {
      schema: "hardkas.txReceipt",
      contentHash: REAL_ARTIFACT_ID,
      txId: REAL_TX_ID,
      lineage: { artifactId: REAL_ARTIFACT_ID, parentArtifactId: "", sequence: 3 }
    });

    let caught: unknown;
    try {
      await store.findReceiptByTxId("f".repeat(64));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ReceiptLookupError);
    expect((caught as any).code).toBe("RECEIPT_NOT_FOUND");
  });

  // ---------------------------------------------------------------------------
  // 5 · duplicate copies of the same receipt (identical contentHash)
  // ---------------------------------------------------------------------------

  it("5. duplicate copies with IDENTICAL non-empty contentHash collapse cleanly", async () => {
    // Two files, same schema, same txId, same non-empty contentHash.
    // These are duplicate copies of the same evidence — return one.
    const shared = {
      schema: "hardkas.txReceipt",
      contentHash: REAL_ARTIFACT_ID,
      txId: REAL_TX_ID,
      lineage: { artifactId: REAL_ARTIFACT_ID, parentArtifactId: "", sequence: 3 }
    };
    await writeJson(
      path.join(artifactsDir, "receipts", `txReceipt-${REAL_ARTIFACT_ID}.json`),
      shared
    );
    await writeJson(
      path.join(artifactsDir, "misc", `dup-copy-${REAL_ARTIFACT_ID}.json`),
      shared
    );

    const receipt: any = await store.findReceiptByTxId(REAL_TX_ID);
    expect(receipt.txId).toBe(REAL_TX_ID);
    expect(receipt.contentHash).toBe(REAL_ARTIFACT_ID);
  });

  // ---------------------------------------------------------------------------
  // 6 · genuine conflict — different contentHash on same txId
  // ---------------------------------------------------------------------------

  it("6. conflicting receipts with same txId and DIFFERENT contentHash throw RECEIPT_AMBIGUOUS_CONFLICT", async () => {
    await writeJson(
      path.join(artifactsDir, "receipts", `txReceipt-${REAL_ARTIFACT_ID}.json`),
      {
        schema: "hardkas.txReceipt",
        contentHash: REAL_ARTIFACT_ID,
        txId: REAL_TX_ID,
        lineage: { artifactId: REAL_ARTIFACT_ID, parentArtifactId: "", sequence: 3 }
      }
    );
    await writeJson(
      path.join(artifactsDir, "receipts", `txReceipt-${"aa".repeat(32)}.json`),
      {
        schema: "hardkas.txReceipt",
        contentHash: "aa".repeat(32), // DIFFERENT hash for same txId
        txId: REAL_TX_ID,
        lineage: { artifactId: "aa".repeat(32), parentArtifactId: "", sequence: 3 }
      }
    );

    await expect(
      store.findReceiptByTxId(REAL_TX_ID)
    ).rejects.toMatchObject({
      name: "ReceiptLookupError",
      code: "RECEIPT_AMBIGUOUS_CONFLICT"
    });
  });

  // ---------------------------------------------------------------------------
  // 7 · non-receipt schema with matching txId — excluded by filter
  // ---------------------------------------------------------------------------

  it("7. non-receipt artifact with matching .txId is excluded by schema filter", async () => {
    // A signedTx artifact carries .txId but is not a receipt. The filter
    // must exclude it.
    await writeJson(
      path.join(artifactsDir, "signed", `signedTx-abc.json`),
      {
        schema: "hardkas.signedTx",
        contentHash: "aa".repeat(32),
        txId: REAL_TX_ID,
        lineage: { artifactId: "aa".repeat(32), parentArtifactId: "", sequence: 2 }
      }
    );

    await expect(
      store.findReceiptByTxId(REAL_TX_ID)
    ).rejects.toMatchObject({
      name: "ReceiptLookupError",
      code: "RECEIPT_NOT_FOUND"
    });
  });

  // ---------------------------------------------------------------------------
  // 8 · simulator failure marker (non-64-hex) still resolvable
  // ---------------------------------------------------------------------------

  it("8. simulator-failure txId marker (simtx_failed_*) is resolvable — no hex-shape enforcement", async () => {
    await writeJson(
      path.join(artifactsDir, "receipts", `txReceipt-simfail.json`),
      {
        schema: "hardkas.txReceipt",
        contentHash: "sim-fail-content-8",
        txId: SIM_TX_ID_FAILED,
        mode: "simulator",
        status: "failed"
      }
    );

    const receipt: any = await store.findReceiptByTxId(SIM_TX_ID_FAILED);
    expect(receipt.txId).toBe(SIM_TX_ID_FAILED);
  });

  // ---------------------------------------------------------------------------
  // 9 · L2 (Igra) receipt with matching field — OUT of scope, must fail closed
  // ---------------------------------------------------------------------------

  it("9. L2 Igra receipt with matching .txId is NOT resolved (L1-only scope)", async () => {
    await writeJson(
      path.join(artifactsDir, "receipts", `igra-receipt.json`),
      {
        schema: "hardkas.igraTxReceipt.v1",
        contentHash: "igra-content-9",
        txId: REAL_TX_ID // same lexical form; different chain
      }
    );

    await expect(
      store.findReceiptByTxId(REAL_TX_ID)
    ).rejects.toMatchObject({
      name: "ReceiptLookupError",
      code: "RECEIPT_NOT_FOUND"
    });
  });

  // ---------------------------------------------------------------------------
  // 10 · missing contentHash on one candidate forces AMBIGUOUS
  // ---------------------------------------------------------------------------

  it("10. multiple matches where one lacks contentHash → RECEIPT_AMBIGUOUS_CONFLICT (no undefined collapse)", async () => {
    await writeJson(
      path.join(artifactsDir, "receipts", `txReceipt-${REAL_ARTIFACT_ID}.json`),
      {
        schema: "hardkas.txReceipt",
        contentHash: REAL_ARTIFACT_ID,
        txId: REAL_TX_ID
      }
    );
    await writeJson(
      path.join(artifactsDir, "misc", "no-content-hash.json"),
      {
        schema: "hardkas.txReceipt",
        // contentHash deliberately absent
        txId: REAL_TX_ID
      }
    );

    let caught: unknown;
    try {
      await store.findReceiptByTxId(REAL_TX_ID);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ReceiptLookupError);
    expect((caught as any).code).toBe("RECEIPT_AMBIGUOUS_CONFLICT");
    // Sanity: context should surface both offenders for diagnosis.
    expect((caught as any).context?.matches).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // 11 · Wave 4 replay artifact shape - exact real receipt fixture
  // ---------------------------------------------------------------------------

  it("11. exact Wave 4 real-node receipt shape resolves in bounded time", async () => {
    const receiptPath = path.join(
      artifactsDir,
      "receipts",
      `txReceipt-${REAL_ARTIFACT_ID}.json`
    );
    await writeJson(receiptPath, {
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
      contentHash: REAL_ARTIFACT_ID,
      lineage: {
        artifactId: REAL_ARTIFACT_ID,
        lineageId: "3fcedcb32121930a9ce46060ed528ddbbef5f2c4d3e13b6e520d28a33fcc85d4",
        parentArtifactId: "b66b90960d165c1026fdb68342b86f72883acd19cd3e2e22f94f57be3d91603c",
        rootArtifactId: "3fcedcb32121930a9ce46060ed528ddbbef5f2c4d3e13b6e520d28a33fcc85d4",
        sequence: 3
      }
    });

    const t0 = Date.now();
    const receipt: any = await store.findReceiptByTxId(REAL_TX_ID);
    const elapsedMs = Date.now() - t0;

    expect(receipt.txId).toBe(REAL_TX_ID);
    expect(receipt.contentHash).toBe(REAL_ARTIFACT_ID);
    expect(receipt.mode).toBe("localnet");
    // Real-node receipts today don't have preStateHash — sanity of shape.
    expect(receipt.preStateHash).toBeUndefined();
    // Bounded time — the enumeration scans O(N) artifacts; a workspace
    // with a handful of artifacts must return well under a second.
    expect(elapsedMs).toBeLessThan(2000);
  });

  // ---------------------------------------------------------------------------
  // 12 · typed error instance guard
  // ---------------------------------------------------------------------------

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
