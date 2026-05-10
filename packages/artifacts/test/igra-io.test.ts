import { describe, it, expect, vi, beforeEach } from "vitest";
import { 
  saveIgraTxReceiptArtifact, 
  loadIgraTxReceiptArtifact, 
  listIgraTxReceiptArtifacts,
  getL2ReceiptPath
} from "../src/igra-io.js";
import * as io from "../src/io.js";
import fs from "node:fs/promises";
import { ARTIFACT_SCHEMAS, HARDKAS_VERSION } from "../src/constants.js";

vi.mock("../src/io.js");
vi.mock("node:fs/promises");

describe("Igra L2 IO Helpers", () => {
  const mockHash = "0x" + "a".repeat(64);
  const mockReceipt = {
    schema: ARTIFACT_SCHEMAS.IGRA_TX_RECEIPT,
    hardkasVersion: HARDKAS_VERSION,
    networkId: "igra",
    mode: "l2-rpc",
    createdAt: new Date().toISOString(),
    txHash: mockHash,
    l2Network: "igra",
    chainId: 12345,
    rpcUrl: "http://localhost:8545",
    status: "submitted"
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject invalid txHash", () => {
    expect(() => getL2ReceiptPath("invalid")).toThrow("Invalid EVM txHash");
  });

  it("should save receipt", async () => {
    await saveIgraTxReceiptArtifact(mockReceipt as any);
    expect(io.writeArtifact).toHaveBeenCalledWith(expect.stringContaining(mockHash), mockReceipt);
  });

  it("should load receipt", async () => {
    (io.readArtifact as any).mockResolvedValue(mockReceipt);
    const result = await loadIgraTxReceiptArtifact(mockHash);
    expect(result).toEqual(mockReceipt);
    expect(io.readArtifact).toHaveBeenCalledWith(expect.stringContaining(mockHash));
  });

  it("should list receipts and sort by createdAt descending", async () => {
    (fs.readdir as any).mockResolvedValue(["a.igra.receipt.json", "b.igra.receipt.json"]);
    
    const r1 = { ...mockReceipt, txHash: "0x" + "1".repeat(64), createdAt: "2026-01-01T00:00:00Z" };
    const r2 = { ...mockReceipt, txHash: "0x" + "2".repeat(64), createdAt: "2026-01-02T00:00:00Z" };

    (io.readArtifact as any)
      .mockResolvedValueOnce(r1)
      .mockResolvedValueOnce(r2);

    const result = await listIgraTxReceiptArtifacts();
    expect(result).toHaveLength(2);
    expect(result[0].txHash).toBe(r2.txHash); // 2026-01-02 comes first
    expect(result[1].txHash).toBe(r1.txHash);
  });

  it("should return empty list if directory missing", async () => {
    (fs.readdir as any).mockRejectedValue({ code: "ENOENT" });
    const result = await listIgraTxReceiptArtifacts();
    expect(result).toEqual([]);
  });
});
