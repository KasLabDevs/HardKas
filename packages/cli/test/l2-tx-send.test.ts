import { describe, it, expect, vi, beforeEach } from "vitest";
import { runL2TxSend, runL2TxReceipt, runL2TxReceipts, runL2TxStatus } from "../src/runners/l2-tx-runners.js";
import { EvmJsonRpcClient } from "@hardkas/l2";
import * as artifacts from "@hardkas/artifacts";

vi.mock("@hardkas/l2", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    EvmJsonRpcClient: vi.fn(),
    normalizeEvmTransactionReceipt: vi.fn((raw) => {
      if (!raw) return null;
      return { 
        txHash: raw.transactionHash || "0x" + "a".repeat(64),
        status: raw.status === "0x1" ? "success" : (raw.status === "0x0" ? "reverted" : "unknown"), 
        blockNumber: BigInt(raw.blockNumber || 0), 
        gasUsed: BigInt(raw.gasUsed || 0) 
      };
    })
  };
});

vi.mock("@hardkas/artifacts", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    readArtifact: vi.fn(),
    writeArtifact: vi.fn(),
    assertValidIgraSignedTxArtifact: vi.fn(),
    assertValidIgraTxReceiptArtifact: vi.fn(),
    loadIgraTxReceiptArtifact: vi.fn(),
    listIgraTxReceiptArtifacts: vi.fn()
  };
});

describe("Igra L2 Transaction Runners", () => {
  const mockHash = "0x" + "a".repeat(64);
  const validSigned = {
    schema: artifacts.ARTIFACT_SCHEMAS.IGRA_SIGNED_TX,
    hardkasVersion: artifacts.HARDKAS_VERSION,
    networkId: "igra",
    mode: "l2-rpc",
    createdAt: new Date().toISOString(),
    signedId: "s1",
    sourcePlanId: "p1",
    l2Network: "igra",
    chainId: 19416,
    rawTransaction: "0x1234",
    status: "signed"
  };

  const mockReceipt = {
    schema: artifacts.ARTIFACT_SCHEMAS.IGRA_TX_RECEIPT,
    hardkasVersion: artifacts.HARDKAS_VERSION,
    networkId: "igra",
    mode: "l2-rpc",
    createdAt: new Date().toISOString(),
    txHash: mockHash,
    l2Network: "igra",
    chainId: 19416,
    rpcUrl: "http://localhost:8545",
    status: "submitted"
  };

  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      getChainId: vi.fn().mockResolvedValue(19416),
      sendRawTransaction: vi.fn().mockResolvedValue(mockHash),
      getTransactionReceipt: vi.fn().mockResolvedValue(null)
    };
    (EvmJsonRpcClient as any).mockImplementation(() => mockClient);
    (artifacts.readArtifact as any).mockResolvedValue(validSigned);
    (artifacts.loadIgraTxReceiptArtifact as any).mockResolvedValue(mockReceipt);
    (artifacts.listIgraTxReceiptArtifacts as any).mockResolvedValue([]);
  });

  describe("runL2TxSend", () => {
    it("should fail without --yes", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("EXIT"); });
      await expect(runL2TxSend({ signedPath: "signed.json", yes: false })).rejects.toThrow("EXIT");
    });

    it("should submit and write receipt on success", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      await runL2TxSend({ signedPath: "signed.json", yes: true, url: "http://localhost:8545" });
      expect(mockClient.sendRawTransaction).toHaveBeenCalledWith("0x1234");
      expect(artifacts.writeArtifact).toHaveBeenCalled();
    });
  });

  describe("runL2TxReceipt", () => {
    it("should show local receipt", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runL2TxReceipt({ txHash: mockHash });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Local:     found"));
    });

    it("should query remote status if URL provided", async () => {
      mockClient.getTransactionReceipt.mockResolvedValue({
        transactionHash: mockHash,
        status: "0x1",
        blockNumber: "0x123"
      });
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runL2TxReceipt({ txHash: mockHash, url: "http://test" });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Status:    success"));
    });
  });

  describe("runL2TxReceipts", () => {
    it("should list local receipts", async () => {
      (artifacts.listIgraTxReceiptArtifacts as any).mockResolvedValue([mockReceipt]);
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runL2TxReceipts({});
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Igra L2 receipts"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(mockHash.substring(0, 10)));
    });
  });

  describe("runL2TxStatus", () => {
    it("should return success for confirmed tx", async () => {
      mockClient.getTransactionReceipt.mockResolvedValue({
        transactionHash: mockHash,
        status: "0x1",
        blockNumber: "0x123"
      });
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runL2TxStatus({ txHash: mockHash, url: "http://test" });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Status:    success"));
    });

    it("should return pending for missing receipt", async () => {
      mockClient.getTransactionReceipt.mockResolvedValue(null);
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runL2TxStatus({ txHash: mockHash, url: "http://test" });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Status:    pending"));
    });
  });
});
