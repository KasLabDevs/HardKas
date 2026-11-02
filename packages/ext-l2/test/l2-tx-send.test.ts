import { describe, it, expect, vi, beforeEach } from "vitest";
import { keccak256 } from "viem";
import {
  runL2TxSend,
  runL2TxReceipt,
  runL2TxReceipts,
  runL2TxStatus
} from "../src/runners/l2-tx-runners.js";
import { EvmJsonRpcClient } from "@hardkas/l2";
import * as artifacts from "@hardkas/artifacts";
import { makeSigned, signRaw } from "./helpers/l2-fixtures.js";

vi.mock("@hardkas/l2", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    EvmJsonRpcClient: vi.fn(),
    normalizeEvmTransactionReceipt: vi.fn((raw) => {
      if (!raw) return null;
      return {
        txHash: raw.transactionHash || "0x" + "a".repeat(64),
        status:
          raw.status === "0x1"
            ? "success"
            : raw.status === "0x0"
              ? "reverted"
              : "unknown",
        blockNumber: BigInt(raw.blockNumber || 0),
        gasUsed: BigInt(raw.gasUsed || 0)
      };
    })
  };
});

vi.mock("@hardkas/artifacts", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    readArtifact: vi.fn(),
    writeArtifact: vi.fn(),
    assertValidIgraTxReceiptArtifact: vi.fn(),
    loadIgraTxReceiptArtifact: vi.fn(),
    listIgraTxReceiptArtifacts: vi.fn()
  };
});

const LOCAL_URL = "http://127.0.0.1:8545";

describe("Igra L2 Transaction Runners", () => {
  const mockHash = "0x" + "a".repeat(64);
  let raw: `0x${string}`;
  let validSigned: any;

  const mockReceipt = {
    schema: artifacts.ARTIFACT_SCHEMAS.IGRA_TX_RECEIPT,
    hardkasVersion: artifacts.HARDKAS_VERSION,
    networkId: "local",
    mode: "l2-rpc",
    createdAt: new Date().toISOString(),
    txHash: mockHash,
    l2Network: "local",
    chainId: 31337,
    rpcUrl: LOCAL_URL,
    status: "submitted"
  };

  let mockClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    raw = await signRaw({ chainId: 31337 });
    validSigned = makeSigned({ l2Network: "local", chainId: 31337, rawTransaction: raw });
    mockClient = {
      getChainId: vi.fn().mockResolvedValue(31337),
      assertExpectedChainId: vi.fn().mockResolvedValue(31337),
      sendRawTransaction: vi.fn().mockImplementation(async (r: `0x${string}`) => keccak256(r)),
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
      await expect(
        runL2TxSend({ signedPath: "signed.json", yes: false })
      ).rejects.toThrow("L2 broadcast cancelled");
      expect(mockClient.sendRawTransaction).not.toHaveBeenCalled();
    });

    it("should submit and write a receipt keyed by keccak256(raw)", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      await runL2TxSend({ signedPath: "signed.json", yes: true, url: LOCAL_URL });
      // The low-level send is guarded: the CLI must pass the chain binding along with the raw tx.
      expect(mockClient.sendRawTransaction).toHaveBeenCalledWith(
        raw,
        expect.objectContaining({ expectedChainId: 31337, profile: expect.objectContaining({ chainId: 31337 }) })
      );
      expect(artifacts.writeArtifact).toHaveBeenCalledWith(
        expect.stringContaining(keccak256(raw)),
        expect.objectContaining({ txHash: keccak256(raw) })
      );
    });

    it("refuses a tampered signed artifact before any RPC call", async () => {
      (artifacts.readArtifact as any).mockResolvedValue({ ...validSigned, networkId: "mainnet" });
      await expect(
        runL2TxSend({ signedPath: "signed.json", yes: true, url: LOCAL_URL })
      ).rejects.toThrow(/modified after it was written/);
      expect(mockClient.sendRawTransaction).not.toHaveBeenCalled();
    });

    it("refuses a raw transaction signed for another chain than the artifact says", async () => {
      const foreign = await signRaw({ chainId: 38836 });
      (artifacts.readArtifact as any).mockResolvedValue(
        makeSigned({ l2Network: "local", chainId: 31337, rawTransaction: foreign })
      );
      await expect(
        runL2TxSend({ signedPath: "signed.json", yes: true, url: LOCAL_URL })
      ).rejects.toThrow(expect.objectContaining({ code: "L2_SIGNED_TX_MISMATCH" }));
      expect(mockClient.sendRawTransaction).not.toHaveBeenCalled();
    });

    it("refuses mainnet with --yes but without --allow-mainnet", async () => {
      const mainnetRaw = await signRaw({ chainId: 38833 });
      (artifacts.readArtifact as any).mockResolvedValue(
        makeSigned({ l2Network: "igra-mainnet", chainId: 38833, rawTransaction: mainnetRaw })
      );
      await expect(
        runL2TxSend({
          signedPath: "signed.json",
          yes: true,
          url: LOCAL_URL,
          maxGasLimit: "100000",
          maxFeePerGas: "10000000000",
          maxTotalFee: "1000000000000000"
        })
      ).rejects.toThrow(expect.objectContaining({ code: "L2_MAINNET_WRITE_BLOCKED" }));
      expect(mockClient.sendRawTransaction).not.toHaveBeenCalled();
    });

    it("rejects an RPC answer that is not keccak256(raw)", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      mockClient.sendRawTransaction.mockResolvedValue("0x" + "1".repeat(64));
      await expect(
        runL2TxSend({ signedPath: "signed.json", yes: true, url: LOCAL_URL })
      ).rejects.toThrow(expect.objectContaining({ code: "L2_TX_HASH_MISMATCH" }));
      expect(artifacts.writeArtifact).not.toHaveBeenCalled();
    });
  });

  describe("runL2TxReceipt", () => {
    it("should show local receipt", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runL2TxReceipt({ txHash: mockHash });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Local:     found")
      );
    });

    it("should query remote status if URL provided", async () => {
      mockClient.getTransactionReceipt.mockResolvedValue({
        transactionHash: mockHash,
        status: "0x1",
        blockNumber: "0x123"
      });
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runL2TxReceipt({ txHash: mockHash, url: LOCAL_URL });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Status:    success")
      );
    });
  });

  describe("runL2TxReceipts", () => {
    it("should list local receipts", async () => {
      (artifacts.listIgraTxReceiptArtifacts as any).mockResolvedValue([mockReceipt]);
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runL2TxReceipts({});
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Igra L2 receipts")
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(mockHash.substring(0, 10))
      );
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
      await runL2TxStatus({ txHash: mockHash, url: LOCAL_URL });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Status:    success")
      );
    });

    it("should return pending for missing receipt", async () => {
      mockClient.getTransactionReceipt.mockResolvedValue(null);
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await runL2TxStatus({ txHash: mockHash, url: LOCAL_URL });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Status:    pending")
      );
    });
  });
});
