import { describe, it, expect, vi } from "vitest";
import { runTxPlan } from "../src/runners/tx-plan-runner.js";
import { HardkasConfig } from "@hardkas/config";

// Mock @hardkas/config, @hardkas/accounts, @hardkas/node-orchestrator, @hardkas/kaspa-rpc
vi.mock("@hardkas/config", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    resolveNewIntentTarget: vi.fn((opts) => {
      if (opts.explicitTarget) return opts.explicitTarget;
      return { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" };
    }),
    resolveProvider: vi.fn((opts) => ({ mode: "kaspa-rpc", endpoint: "http://mock", network: opts.network || "testnet-10" }))
  };
});

vi.mock("@hardkas/accounts", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    resolveHardkasAccountAddress: vi.fn(async () => "kaspatest:qmockaddress123"),
    resolveHardkasAccount: vi.fn(() => ({
      name: "alice",
      kind: "kaspa",
      address: "kaspatest:qmockaddress123",
      network: "testnet-10"
    })),
    assertAccountCompatible: vi.fn((account, target) => {
      if (account.network && target.network && account.network !== target.network) {
        throw new Error("AccountNetworkMismatchError");
      }
    })
  };
});

describe("Execution Guard - CLI Runners", () => {
  const dummyConfig: HardkasConfig = {
    networks: {
      "testnet-10": { kind: "kaspa-rpc", rpcUrl: "http://mock" },
      mainnet: { kind: "kaspa-rpc", rpcUrl: "http://mock" }
    }
  };

  it("tx-plan-runner uses assertAccountCompatible and throws on mismatch", async () => {
    // If the CLI passes a network that mismatches the account network, it should throw
    await expect(
      runTxPlan({
        from: "alice",
        to: "bob",
        amount: "1",
        networkId: "mainnet", // This will resolve to mainnet, but account alice is mocked as testnet-10
        provider: "default",
        config: dummyConfig
      })
    ).rejects.toThrow("AccountNetworkMismatchError");
  });

  it("tx-plan-runner succeeds when account network matches execution target", async () => {
    // Mock the SDK fees estimate
    vi.doMock("@hardkas/sdk", () => {
      return {
        HardkasFees: class {
          estimate() {
            return Promise.resolve({ feeRate: 1n });
          }
        },
        PendingSpendService: {
          load: vi.fn().mockResolvedValue({
            reconcile: vi.fn(),
            filterSpendableOrFail: vi.fn((s, u) => u),
            persist: vi.fn()
          })
        }
      };
    });

    vi.doMock("@hardkas/kaspa-rpc", () => {
      return {
        JsonWrpcKaspaClient: class {
          async getBlockDagInfo() {
            return { virtualDaaScore: "1000", virtualParentHashes: [], sink: "mock" };
          }
          async getUtxosByAddress() {
            return [
              {
                outpoint: { transactionId: "mocktx", index: 0 },
                address: "kaspatest:qmockaddress123",
                amountSompi: 200000000000n, // enough sompi
                isCoinbase: false
              }
            ];
          }
          async checkMempoolPresence() {
            return false;
          }
          async close() {}
        }
      };
    });

    vi.doMock("@hardkas/node-orchestrator", () => ({
      resolveRuntimeConfig: () => ({ rpcUrl: "http://mock" })
    }));

    vi.resetModules();

    // Dynamically import runTxPlan after resetting modules so it picks up the local vi.doMock
    const { runTxPlan: dynamicRunTxPlan } = await import("../src/runners/tx-plan-runner.js");
    const { assertAccountCompatible } = await import("@hardkas/accounts");

    await dynamicRunTxPlan({
      from: "alice",
      to: "bob",
      amount: "1",
      networkId: "testnet-10", // Matches alice testnet-10 account
      provider: "default",
      config: dummyConfig
    });

    expect(assertAccountCompatible).toHaveBeenCalled();
  });
});
