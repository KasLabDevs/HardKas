import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// G7 g (notes cross-check, 01-wallet-safety §4): `accounts balance` reported the node's balance with covenant-bound
// UTXOs inside it and unlabelled, while every planner refuses to spend them: balance ≠ spendable. The result now carries
// `spendableSompi`, `covenantBoundSompi` and `covenantUtxoCount` beside the unchanged fields. A fake node stands in.

const COVENANT = "cd".repeat(32);
const node = vi.hoisted(() => ({
  constructed: [] as any[],
  closed: 0,
  utxos: [] as any[],
  balance: 0n
}));

vi.mock("@hardkas/kaspa-rpc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hardkas/kaspa-rpc")>();
  class FakeJsonWrpcKaspaClient {
    constructor(public options: any) {
      node.constructed.push(options);
    }
    async getBalanceByAddress(address: string) {
      return { address, balanceSompi: node.balance };
    }
    async getUtxosByAddress() {
      return node.utxos;
    }
    async close() {
      node.closed++;
    }
  }
  return { ...actual, JsonWrpcKaspaClient: FakeJsonWrpcKaspaClient };
});

const { runAccountsBalance, splitCovenantBalance } = await import("../src/runners/accounts-balance-runner.js");

const ADDRESS = "kaspasim:qpcovenantbalance";

describe("G7 g · accounts balance labels covenant-bound coins", () => {
  let dir: string;
  const originalCwd = process.cwd();

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-g7g-balance-"));
    fs.writeFileSync(path.join(dir, "hardkas.config.ts"), "export default { defaultNetwork: 'simnet' };");
    process.chdir(dir);
  });
  afterAll(() => {
    process.chdir(originalCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("splitCovenantBalance: plain and covenant-bound amounts, in every covenant-id shape", () => {
    expect(
      splitCovenantBalance([
        { amountSompi: 100n },
        { amountSompi: 40n, covenantId: COVENANT },
        { amountSompi: "7", utxoEntry: { covenant_id: COVENANT } },
        { amountSompi: 3 }
      ])
    ).toEqual({ spendableSompi: 103n, covenantBoundSompi: 47n, covenantUtxoCount: 2 });
    expect(splitCovenantBalance([])).toEqual({ spendableSompi: 0n, covenantBoundSompi: 0n, covenantUtxoCount: 0 });
  });

  it("on a node: balanceSompi and utxoCount unchanged; the covenant-bound part is reported apart", async () => {
    node.balance = 1_500_000_000n;
    node.utxos = [
      { outpoint: { transactionId: "a".repeat(64), index: 0 }, address: ADDRESS, amountSompi: 1_000_000_000n },
      { outpoint: { transactionId: "b".repeat(64), index: 1 }, address: ADDRESS, amountSompi: 500_000_000n, covenantId: COVENANT }
    ];
    const result = await runAccountsBalance({ identifier: ADDRESS, network: "simnet", provider: "rpc", url: "ws://127.0.0.1:18210" });
    expect(result).toMatchObject({
      address: ADDRESS,
      balanceSompi: 1_500_000_000n,
      utxoCount: 2,
      network: "simnet",
      spendableSompi: 1_000_000_000n,
      covenantBoundSompi: 500_000_000n,
      covenantUtxoCount: 1
    });
    expect(node.constructed.at(-1)).toMatchObject({ rpcUrl: "ws://127.0.0.1:18210", expectedNetworkId: "simnet" });
    expect(node.closed).toBeGreaterThan(0);
  });

  it("no covenant coins: spendable equals the UTXO sum, covenant-bound 0", async () => {
    node.balance = 30n;
    node.utxos = [
      { outpoint: { transactionId: "c".repeat(64), index: 0 }, address: ADDRESS, amountSompi: 10n },
      { outpoint: { transactionId: "d".repeat(64), index: 0 }, address: ADDRESS, amountSompi: 20n }
    ];
    const result = await runAccountsBalance({ identifier: ADDRESS, network: "simnet", provider: "rpc", url: "ws://127.0.0.1:18210" });
    expect(result).toMatchObject({ balanceSompi: 30n, spendableSompi: 30n, covenantBoundSompi: 0n, covenantUtxoCount: 0 });
  });
});
