import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// HK-10 · `hardkas accounts consolidate --execute` mapped the node's UTXOs keeping only outpoint, address, amount and
// script (X3-02-tx.log: ["outpoint","address","amountSompi","scriptPublicKey"]), so every coinbase looked mature to the
// planner and a batch with a coinbase a few DAA old was signed, sent and refused by the node (ImmatureCoinbaseSpend) after
// the earlier batches had gone out. Now the coinbase fields are kept and immature coinbases are left out before batching.

const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const SPK = "20" + "00".repeat(32) + "ac";
const VIRTUAL = 5000n;
const utxo = (n: number, amountSompi: bigint, extra: Record<string, unknown>) => ({
  outpoint: { transactionId: String(n).repeat(64).slice(0, 64), index: 0 },
  address: FROM,
  amountSompi,
  scriptPublicKey: SPK,
  ...extra
});
const nodeUtxos = [
  utxo(1, 100_000_000n, { isCoinbase: true, blockDaaScore: 4995n }), // 5 DAA old: immature
  utxo(2, 200_000_000n, { isCoinbase: true, blockDaaScore: 100n }),
  utxo(3, 300_000_000n, { isCoinbase: false, blockDaaScore: 4999n }),
  utxo(4, 400_000_000n, { isCoinbase: true, blockDaaScore: 200n })
];
const captured: any[][] = [];
// the runner reloads the localnet state of the workspace at the end: a workspace of the test's own, never the repo root
const WS = fs.mkdtempSync(path.join(os.tmpdir(), "hk-hk10-cli-"));
(globalThis as any).__hk10Workspace = WS;
afterAll(() => fs.rmSync(WS, { recursive: true, force: true }));

vi.mock("@hardkas/kaspa-rpc", async () => {
  const actual: any = await vi.importActual("@hardkas/kaspa-rpc");
  class ScriptedClient {
    async getUtxosByAddress() {
      return nodeUtxos.map((u) => ({ ...u }));
    }
    async getBlockDagInfo() {
      return { networkId: "simnet", virtualDaaScore: VIRTUAL };
    }
    async close() {}
  }
  return { ...actual, JsonWrpcKaspaClient: ScriptedClient };
});

vi.mock("@hardkas/sdk", async () => {
  const actual: any = await vi.importActual("@hardkas/sdk");
  const standIn = {
    config: { config: { networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } } } },
    network: "simnet",
    execution: { mode: "localnet" },
    get workspace() {
      return { root: (globalThis as any).__hk10Workspace as string };
    },
    accounts: { resolve: async () => ({ name: "miner", address: FROM }) },
    tx: {
      createConsolidationPlan: async (o: any) => {
        captured.push(o.selectedUtxos);
        return { planned: true };
      },
      sign: async () => ({ signed: true }),
      send: async () => ({ receipt: { txId: "f".repeat(64) } }),
      simulate: async () => ({ receipt: { txId: "f".repeat(64) } })
    },
    close: async () => {}
  };
  return { ...actual, Hardkas: { open: async () => standIn } };
});

describe("HK-10 · accounts consolidate --execute never batches an immature coinbase", () => {
  beforeEach(() => {
    captured.length = 0;
  });

  it("the coinbase fields reach the planner and the 5-DAA-old coinbase is left out", async () => {
    const { runAccountsConsolidate } = await import("../src/runners/accounts-consolidate-runner.js");
    await runAccountsConsolidate({
      account: "miner",
      network: "simnet",
      url: "ws://127.0.0.1:1",
      targetUtxos: 1,
      batchSize: 10,
      dryRun: false,
      execute: true,
      yes: true,
      allowMainnet: false,
      json: true
    });
    const batched = captured.flat();
    expect(batched.map((u) => u.outpoint.transactionId[0])).not.toContain("1");
    expect(batched).toHaveLength(3);
    for (const u of batched) {
      expect(Object.keys(u)).toEqual(expect.arrayContaining(["isCoinbase", "blockDaaScore"]));
    }
  });
});
