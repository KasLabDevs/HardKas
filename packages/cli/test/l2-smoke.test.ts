import { describe, it, expect, vi, beforeEach } from "vitest";
import { runL2Networks } from "../src/runners/l2-networks-runner.js";
import { runL2ProfileShow } from "../src/runners/l2-profile-show-runner.js";
import { runL2ProfileValidate } from "../src/runners/l2-profile-validate-runner.js";
import { runL2RpcChainId, runL2RpcGasPrice } from "../src/runners/l2-rpc-query-runners.js";
import { runL2RpcHealth } from "../src/runners/l2-rpc-health-runner.js";
import { runL2Balance, runL2Nonce } from "../src/runners/l2-account-runners.js";
import { runL2Call, runL2EstimateGas } from "../src/runners/l2-call-runners.js";
import { runL2TxBuild, runL2TxSign, runL2TxSend, runL2TxStatus } from "../src/runners/l2-tx-runners.js";
import { runL2ContractDeployPlan } from "../src/runners/l2-contract-runners.js";
import { runL2BridgeStatus } from "../src/runners/l2-bridge-runners.js";
import * as l2 from "@hardkas/l2";
import * as localnet from "@hardkas/localnet";
import * as artifacts from "@hardkas/artifacts";

// Mock @hardkas/l2
vi.mock("@hardkas/l2", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    EvmJsonRpcClient: vi.fn().mockImplementation(() => ({
      getChainId: vi.fn().mockResolvedValue(12345),
      getBlockNumber: vi.fn().mockResolvedValue(100n),
      getGasPriceWei: vi.fn().mockResolvedValue(1000000000n),
      getBalanceWei: vi.fn().mockResolvedValue(1000000000000000000n),
      getTransactionCount: vi.fn().mockResolvedValue(5n),
      call: vi.fn().mockResolvedValue("0x1234"),
      estimateGas: vi.fn().mockResolvedValue(21000n),
      sendRawTransaction: vi.fn().mockResolvedValue("0x0000000000000000000000000000000000000000000000000000000000000001"),
      getTransactionReceipt: vi.fn().mockResolvedValue({
        transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
        status: "0x1",
        blockNumber: "0x64",
        gasUsed: "0x5208"
      })
    })),
    ViemIgraTxSigner: vi.fn().mockImplementation(() => ({
      sign: vi.fn().mockResolvedValue({
        rawTransaction: "0xraw",
        txHash: "0x0000000000000000000000000000000000000000000000000000000000000001"
      })
    }))
  };
});

// Mock @hardkas/accounts
vi.mock("@hardkas/accounts", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    loadRealAccountStore: vi.fn().mockResolvedValue({ accounts: [] }),
    resolveRealAccountOrAddress: vi.fn().mockReturnValue({
      address: "0x1234567890123456789012345678901234567890",
      name: "test",
      privateKey: "0xkey"
    })
  };
});

// Mock @hardkas/artifacts
vi.mock("@hardkas/artifacts", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    writeArtifact: vi.fn().mockResolvedValue(undefined),
    readArtifact: vi.fn().mockImplementation(async (p: string) => {
       if (p.includes(".plan.json")) return {
         schema: "hardkas.igraTxPlan.v1",
         hardkasVersion: "0.2.2-alpha",
         networkId: "igra",
         mode: "l2-rpc",
         planId: "test-plan",
         l2Network: "igra",
         chainId: 12345,
         request: { from: "0x1234567890123456789012345678901234567890", to: "0x1234567890123456789012345678901234567890", data: "0x", valueWei: "0" },
         status: "built"
       };
       if (p.includes(".signed.json")) return {
         schema: "hardkas.igraSignedTx.v1",
         hardkasVersion: "0.2.2-alpha",
         networkId: "igra",
         mode: "l2-rpc",
         signedId: "test-signed",
         l2Network: "igra",
         chainId: 12345,
         rawTransaction: "0xraw",
         txHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
         status: "signed"
       };
       throw new Error(`Artifact not found: ${p}`);
    }),
    createIgraPlanId: vi.fn().mockReturnValue("test-plan"),
    createIgraSignedId: vi.fn().mockReturnValue("test-signed"),
    createIgraDeployPlanId: vi.fn().mockReturnValue("test-deploy-plan"),
    assertValidIgraTxPlanArtifact: vi.fn(),
    assertValidIgraSignedTxArtifact: vi.fn()
  };
});

describe("Igra L2 Smoke Tests (Mocked)", () => {
  let consoleSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  describe("Profile & Discovery", () => {
    it("l2 networks", async () => {
      await runL2Networks();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("igra"));
    });

    it("l2 profile show igra", async () => {
      await runL2ProfileShow({ name: "igra" });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Name:        igra"));
    });

    it("l2 profile validate igra", async () => {
      await runL2ProfileValidate({ name: "igra" });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("VALID"));
    });
  });

  describe("RPC & Diagnostics", () => {
    it("l2 rpc health", async () => {
      await runL2RpcHealth({ network: "igra", url: "http://localhost:8545" });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("ready"));
    });

    it("l2 rpc chain-id", async () => {
      await runL2RpcChainId({ network: "igra", url: "http://localhost:8545" });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("12345"));
    });

    it("l2 rpc gas-price", async () => {
      await runL2RpcGasPrice({ network: "igra", url: "http://localhost:8545" });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("1000000000 wei"));
    });
  });

  describe("Account State", () => {
    it("l2 balance", async () => {
      await runL2Balance("0x1234567890123456789012345678901234567890", { network: "igra", url: "http://localhost:8545" });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("1.000000000000000000 iKAS"));
    });

    it("l2 nonce", async () => {
      await runL2Nonce("0x1234567890123456789012345678901234567890", { network: "igra", url: "http://localhost:8545" });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("5"));
    });
  });

  describe("EVM Calls", () => {
    it("l2 call", async () => {
      await runL2Call({ to: "0x1234567890123456789012345678901234567890", network: "igra", url: "http://localhost:8545" });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("0x1234"));
    });

    it("l2 estimate-gas", async () => {
      await runL2EstimateGas({ to: "0x1234567890123456789012345678901234567890", network: "igra", url: "http://localhost:8545" });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("21000"));
    });
  });

  describe("Transaction Flow", () => {
    it("l2 tx build -> sign -> send -> status", async () => {
      // Build
      await runL2TxBuild({ to: "0x1234567890123456789012345678901234567890", network: "igra", url: "http://localhost:8545" });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("plan built"));

      // Sign
      await runL2TxSign({ planPath: "plans/test.igra.plan.json", account: "test" });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("signed"));

      // Send
      await runL2TxSend({ signedPath: "signed/test.igra.signed.json", network: "igra", url: "http://localhost:8545", yes: true });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("submitted"));

      // Status
      await runL2TxStatus({ txHash: "0x0000000000000000000000000000000000000000000000000000000000000001", network: "igra", url: "http://localhost:8545" });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("success"));
    });

    it("l2 contract deploy-plan", async () => {
      await runL2ContractDeployPlan({ 
        from: "0x1234567890123456789012345678901234567890", 
        bytecode: "0x60006000",
        network: "igra", 
        url: "http://localhost:8545" 
      });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("contract deploy plan built"));
    });
  });

  describe("Bridge Awareness", () => {
    it("l2 bridge status", async () => {
      await runL2BridgeStatus({ network: "igra" });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Igra bridge status"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("pre-zk"));
    });
  });
});
