import { systemRuntimeContext } from "@hardkas/core";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  saveSimulatedReceipt,
  loadSimulatedReceipt,
  listSimulatedReceipts,
  StoredSimulatedTxReceipt
} from "../src/receipts";
import { ARTIFACT_SCHEMAS, calculateContentHash } from "@hardkas/artifacts";

// Wave 1.2 · IC-5′: `loadSimulatedReceipt` is the verified `tx` namespace, so the
// fixtures are sealed under the version they declare (hashVersion 1 here) and the
// not-found cases are typed (`RECEIPT_NOT_FOUND`).
const seal1 = (r: any) => ({ ...r, contentHash: calculateContentHash(r, 1) });

describe("receipts store", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-receipts-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const mockReceipt: any = seal1({
    schema: ARTIFACT_SCHEMAS.TX_RECEIPT,
    hardkasVersion: "0.12.0-rc.23",
    version: "1.0.0-alpha",
    hashVersion: 1,
    txId: "simtx_test_123",
    mode: "simulator",
    networkId: "simnet",
    fromAddress: "alice",
    toAddress: "bob",
    amountSompi: "1000",
    feeSompi: "1",
    spentUtxoIds: ["u1"],
    createdUtxoIds: ["u2"],
    daaScore: "10",
    createdAt: new Date().toISOString()
  });

  it("should save and load a receipt", async () => {
    const path = await saveSimulatedReceipt(mockReceipt, { cwd: tempDir });
    // The store names the file by the receipt's identity (its content hash), not its txId.
    expect(path).toContain(`${mockReceipt.contentHash}.json`);

    const loaded = await loadSimulatedReceipt(mockReceipt.txId, { cwd: tempDir });
    expect(loaded).toEqual(mockReceipt);
  });

  it("should list receipts sorted by date", async () => {
    const r1: any = seal1({ ...mockReceipt, txId: "tx1", createdAt: "2026-01-01T10:00:00Z" });
    const r2: any = seal1({ ...mockReceipt, txId: "tx2", createdAt: "2026-01-01T11:00:00Z" });

    await saveSimulatedReceipt(r1, { cwd: tempDir });
    await saveSimulatedReceipt(r2, { cwd: tempDir });

    const list = await listSimulatedReceipts({ cwd: tempDir });
    expect(list.length).toBe(2);
    expect(list[0]!.txId).toBe("tx2"); // Newest first
    expect(list[1]!.txId).toBe("tx1");
  });

  it("should throw error for invalid txId (path traversal)", async () => {
    // A txId is never a path: the tx namespace simply has no such receipt.
    await expect(loadSimulatedReceipt("../etc/passwd", { cwd: tempDir })).rejects.toMatchObject({
      code: "RECEIPT_NOT_FOUND"
    });

    // A receipt without an identity would be named by its txId: a path-shaped txId is refused.
    const { contentHash: _omit, ...unsealed } = mockReceipt;
    await expect(
      saveSimulatedReceipt({ ...unsealed, txId: "subdir/tx" }, { cwd: tempDir })
    ).rejects.toThrow("Invalid txId");
  });

  it("should throw error if receipt not found", async () => {
    await expect(loadSimulatedReceipt("missing", { cwd: tempDir })).rejects.toMatchObject({
      code: "RECEIPT_NOT_FOUND"
    });
  });
});
