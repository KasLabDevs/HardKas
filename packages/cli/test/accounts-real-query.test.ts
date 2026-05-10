import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAccountsRealBalance } from "../src/runners/accounts-real-balance-runner.js";
import { runAccountsRealUtxos } from "../src/runners/accounts-real-utxos-runner.js";
import * as localnet from "@hardkas/localnet";
import * as accounts from "@hardkas/accounts";
import { MockKaspaRpcClient, JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import * as artifacts from "@hardkas/artifacts";

// Mock accounts functions
vi.mock("@hardkas/accounts", async () => {
  const actual = await vi.importActual("@hardkas/accounts");
  return {
    ...actual,
    loadRealAccountStore: vi.fn(),
    getRealDevAccount: actual.getRealDevAccount, // Keep actual implementation
    listRealDevAccounts: actual.listRealDevAccounts
  };
});

// Mock Kaspa RPC Client
vi.mock("@hardkas/kaspa-rpc", async () => {
  const actual = await vi.importActual("@hardkas/kaspa-rpc");
  return {
    ...actual,
    JsonWrpcKaspaClient: vi.fn()
  };
});

describe("Real Account Queries (Balance & UTXOs)", () => {
  const mockStore: localnet.RealAccountStore = {
    schema: artifacts.ARTIFACT_SCHEMAS.REAL_ACCOUNT_STORE,
    hardkasVersion: artifacts.HARDKAS_VERSION,
    version: artifacts.ARTIFACT_VERSION,
    createdAt: new Date().toISOString(),
    networkId: "simnet",
    mode: "node",
    warning: "test",
    accounts: [
      {
        name: "alice",
        address: "kaspasim:alice123",
        createdAt: new Date().toISOString()
      }
    ]
  };

  const mockRpc = new MockKaspaRpcClient("simnet");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(accounts.loadRealAccountStore).mockResolvedValue(mockStore);
    
    // Setup Mock RPC behaviors
    mockRpc.setUtxos("kaspasim:alice123", [
      {
        outpoint: { transactionId: "tx1", index: 0 },
        address: "kaspasim:alice123",
        amountSompi: 100000000n, // 1 KAS
        blockDaaScore: 100n
      },
      {
        outpoint: { transactionId: "tx2", index: 1 },
        address: "kaspasim:alice123",
        amountSompi: 50000000n, // 0.5 KAS
        blockDaaScore: 101n
      }
    ]);

    vi.mocked(JsonWrpcKaspaClient).mockImplementation(() => mockRpc as any);
  });

  describe("runAccountsRealBalance", () => {
    it("should resolve alias and fetch balance", async () => {
      const result = await runAccountsRealBalance({ name: "alice" });
      expect(result.balanceSompi).toBe(150000000n);
      expect(result.formatted).toContain("alice balance: 1.50000000 KAS");
    });

    it("should throw if alias not found", async () => {
      await expect(runAccountsRealBalance({ name: "bob" }))
        .rejects.toThrow(/Account 'bob' not found in real store/);
    });
  });

  describe("runAccountsRealUtxos", () => {
    it("should list detailed UTXOs", async () => {
      const result = await runAccountsRealUtxos({ name: "alice" });
      expect(result.formatted).toContain("tx1:0");
      expect(result.formatted).toContain("1.00000000 KAS");
      expect(result.formatted).toContain("tx2:1");
      expect(result.formatted).toContain("0.50000000 KAS");
    });
  });
});
