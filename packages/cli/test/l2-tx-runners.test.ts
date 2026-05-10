import { describe, it, expect, vi, beforeEach } from "vitest";
import { runL2TxBuild, runL2TxSign } from "../src/runners/l2-tx-runners.js";
import fs from "node:fs/promises";
import { EvmJsonRpcClient, ViemIgraTxSigner, UnsupportedIgraTxSigner } from "@hardkas/l2";
import { 
  ARTIFACT_SCHEMAS, 
  HARDKAS_VERSION 
} from "@hardkas/artifacts";

vi.mock("node:fs/promises");
vi.mock("@hardkas/l2", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    EvmJsonRpcClient: vi.fn(),
    ViemIgraTxSigner: vi.fn().mockImplementation(() => ({
      sign: vi.fn().mockRejectedValue(new Error("EVM signing dependency (viem) is not installed."))
    })),
    UnsupportedIgraTxSigner: vi.fn().mockImplementation(() => ({
      sign: vi.fn().mockRejectedValue(new Error("Igra L2 transaction signing is not configured yet."))
    }))
  };
});

vi.mock("@hardkas/accounts", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    loadRealAccountStore: vi.fn().mockResolvedValue({ accounts: [] }),
    resolveRealAccountOrAddress: vi.fn().mockReturnValue({
      address: "0x1234567890123456789012345678901234567890",
      name: "alice",
      privateKey: "0xabc"
    })
  };
});

describe("L2 Tx Build Runner", () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      getChainId: vi.fn().mockResolvedValue(12345),
      getTransactionCount: vi.fn().mockResolvedValue(7n),
      getGasPriceWei: vi.fn().mockResolvedValue(1000000000n),
      estimateGas: vi.fn().mockResolvedValue(21000n)
    };
    (EvmJsonRpcClient as any).mockImplementation(() => mockClient);
  });

  it("should build a transaction plan artifact", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    
    await runL2TxBuild({
      network: "igra",
      url: "http://localhost:8545",
      from: "0x1234567890123456789012345678901234567890",
      to: "0x0000000000000000000000000000000000000000",
      value: "1000000000000000000",
      outDir: "test-plans"
    });

    expect(mockClient.getChainId).toHaveBeenCalled();
    expect(mockClient.getTransactionCount).toHaveBeenCalled();
    expect(mockClient.getGasPriceWei).toHaveBeenCalled();
    expect(mockClient.estimateGas).toHaveBeenCalled();
    
    expect(fs.mkdir).toHaveBeenCalledWith("test-plans", expect.any(Object));
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("test-plans"),
      expect.stringContaining('"schema": "hardkas.igraTxPlan.v1"'),
      "utf-8"
    );

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("L2 transaction plan built"));
  });

  it("should use provided overrides instead of fetching", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    
    await runL2TxBuild({
      network: "igra",
      url: "http://localhost:8545",
      to: "0x0000000000000000000000000000000000000000",
      nonce: "10",
      gasLimit: "30000",
      gasPrice: "2000000000"
    });

    expect(mockClient.getTransactionCount).not.toHaveBeenCalled();
    expect(mockClient.getGasPriceWei).not.toHaveBeenCalled();
    expect(mockClient.estimateGas).not.toHaveBeenCalled();
    
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('"nonce": "10"'),
      "utf-8"
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('"gasLimit": "30000"'),
      "utf-8"
    );
  });
});

describe("L2 Tx Sign Runner", () => {
  const validPlan = {
    schema: ARTIFACT_SCHEMAS.IGRA_TX_PLAN,
    hardkasVersion: HARDKAS_VERSION,
    networkId: "igra",
    mode: "l2-rpc",
    createdAt: new Date().toISOString(),
    planId: "p1",
    l2Network: "igra",
    chainId: 12345,
    request: {
      from: "0x1234567890123456789012345678901234567890",
      to: "0x0000000000000000000000000000000000000000",
      data: "0x",
      valueWei: "0",
      gasLimit: "21000",
      gasPriceWei: "1000000000",
      nonce: "7"
    },
    status: "built"
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (fs.readFile as any).mockResolvedValue(JSON.stringify(validPlan));
  });

  it("should sign a plan with a mock signer", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const mockSigner = {
      sign: vi.fn().mockResolvedValue({
        rawTransaction: "0x1234",
        txHash: "0x" + "0".repeat(64)
      })
    };

    await runL2TxSign({
      planPath: "plan.json",
      account: "alice",
      signerOverride: mockSigner
    });

    expect(mockSigner.sign).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("signed"),
      expect.stringContaining('"schema": "hardkas.igraSignedTx.v1"'),
      "utf-8"
    );
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Igra L2 transaction signed"));
  });

  it("should report missing viem clearly", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("EXIT"); });

    await expect(runL2TxSign({
      planPath: "plan.json",
      account: "alice"
    })).rejects.toThrow("EXIT");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Igra L2 signing is not available"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("pnpm add viem"));
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("should reject address mismatch", async () => {
    const mismatchedPlan = {
      ...validPlan,
      request: {
        ...validPlan.request,
        from: "0x0000000000000000000000000000000000000000"
      }
    };
    (fs.readFile as any).mockResolvedValue(JSON.stringify(mismatchedPlan));

    await expect(runL2TxSign({
      planPath: "plan.json",
      account: "alice"
    })).rejects.toThrow("Account address mismatch");
  });
});
