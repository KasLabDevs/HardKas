import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { 
  saveSimulatedReceipt, 
  loadSimulatedReceipt, 
  listSimulatedReceipts,
  getReceiptPath,
  StoredSimulatedTxReceipt
} from "../src/receipts";
import { ARTIFACT_SCHEMAS } from "@hardkas/artifacts";

describe("receipts store", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-receipts-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const mockReceipt: any = {
    schema: ARTIFACT_SCHEMAS.TX_RECEIPT,
    hardkasVersion: "0.2.0-alpha",
    version: "1.0.0-alpha",
    txId: "simtx_test_123",
    mode: "simulated",
    networkId: "simnet",
    fromAddress: "alice",
    toAddress: "bob",
    amountSompi: "1000",
    feeSompi: "1",
    spentUtxoIds: ["u1"],
    createdUtxoIds: ["u2"],
    daaScore: "10",
    createdAt: new Date().toISOString()
  };

  it("should save and load a receipt", async () => {
    const path = await saveSimulatedReceipt(mockReceipt, { cwd: tempDir });
    expect(path).toContain("simtx_test_123.json");

    const loaded = await loadSimulatedReceipt(mockReceipt.txId, { cwd: tempDir });
    expect(loaded).toEqual(mockReceipt);
  });

  it("should list receipts sorted by date", async () => {
    const r1: any = { ...mockReceipt, txId: "tx1", createdAt: "2026-01-01T10:00:00Z" };
    const r2: any = { ...mockReceipt, txId: "tx2", createdAt: "2026-01-01T11:00:00Z" };
    
    await saveSimulatedReceipt(r1, { cwd: tempDir });
    await saveSimulatedReceipt(r2, { cwd: tempDir });
    
    const list = await listSimulatedReceipts({ cwd: tempDir });
    expect(list.length).toBe(2);
    expect(list[0]!.txId).toBe("tx2"); // Newest first
    expect(list[1]!.txId).toBe("tx1");
  });

  it("should throw error for invalid txId (path traversal)", async () => {
    await expect(loadSimulatedReceipt("../etc/passwd", { cwd: tempDir }))
      .rejects.toThrow("Invalid txId");
    
    await expect(saveSimulatedReceipt({ ...mockReceipt, txId: "subdir/tx" }, { cwd: tempDir }))
      .rejects.toThrow("Invalid txId");
  });

  it("should throw error if receipt not found", async () => {
    await expect(loadSimulatedReceipt("missing", { cwd: tempDir }))
      .rejects.toThrow("Receipt not found");
  });
});
