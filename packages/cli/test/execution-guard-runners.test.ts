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

// Wave 2(b) · AUD-17: the CLI plans through the upstream Generator, which validates real
// addresses, so the fixture address is derived with kaspa-wasm itself (a fixed key).
async function testnetFixtureAddress(actualAccounts: any): Promise<string> {
  const { PrivateKey } = await actualAccounts.loadKaspaWasm();
  return (new PrivateKey("11".repeat(32)) as any).toKeypair().toAddress("testnet").toString();
}

vi.mock("@hardkas/accounts", async (importOriginal) => {
  const actual: any = await importOriginal();
  const address = await testnetFixtureAddress(actual);
  return {
    ...actual,
    resolveHardkasAccountAddress: vi.fn(async () => address),
    resolveHardkasAccount: vi.fn(() => ({
      name: "alice",
      kind: "kaspa",
      address,
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

    const actualAccounts: any = await vi.importActual("@hardkas/accounts");
    const fixtureAddress = await testnetFixtureAddress(actualAccounts);

    vi.doMock("@hardkas/kaspa-rpc", () => {
      return {
        JsonWrpcKaspaClient: class {
          async getBlockDagInfo() {
            return { virtualDaaScore: "1000", virtualParentHashes: [], sink: "mock" };
          }
          async getUtxosByAddress() {
            return [
              {
                // Wave 2(b) · AUD-17: the CLI now plans through the upstream Generator, which
                // validates real inputs — the fixture is a well-formed outpoint, address and script.
                outpoint: { transactionId: "a".repeat(64), index: 0 },
                address: fixtureAddress,
                amountSompi: 200000000000n, // enough sompi
                scriptPublicKey: "20" + "00".repeat(32) + "ac",
                blockDaaScore: 1n,
                isCoinbase: false
              }
            ];
          }
          async checkMempoolPresence() {
            return false;
          }
          // Wave 2(c) · AUD-19: the planner requires ONE mempool observation; this node's mempool is empty.
          async getMempoolEntriesByAddresses() {
            return { entries: [] };
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
