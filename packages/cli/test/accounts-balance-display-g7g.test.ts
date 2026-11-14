import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";

// G7 g (display) · the human output of `accounts balance`: the node's balance includes covenant-bound UTXOs that no payment
// spends. When the address holds some, two lines follow the Balance line — the covenant-bound amount with its UTXO count,
// and the spendable amount — formatted from the bigints (G7 n). Without covenant UTXOs the output is unchanged. A fake node
// client stands in (as in accounts-balance-covenant-g7g.test.ts); nothing is contacted.

const COVENANT = "cd".repeat(32);
const ADDRESS = "kaspasim:qpcovenantbalance";
const node = vi.hoisted(() => ({ utxos: [] as any[], balance: 0n }));

vi.mock("@hardkas/kaspa-rpc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hardkas/kaspa-rpc")>();
  class FakeJsonWrpcKaspaClient {
    constructor(public options: any) {}
    async getBalanceByAddress(address: string) {
      return { address, balanceSompi: node.balance };
    }
    async getUtxosByAddress() {
      return node.utxos;
    }
    async close() {}
  }
  return { ...actual, JsonWrpcKaspaClient: FakeJsonWrpcKaspaClient };
});

const { registerAccountsCommands } = await import("../src/commands/accounts.js");
const { createCommandOutput, setGlobalOutput } = await import("../src/output.js");

async function balanceText(): Promise<string> {
  let text = "";
  setGlobalOutput(createCommandOutput({ mode: "human", stdout: { write: (m: string) => (text += m) }, stderr: { write: () => undefined } }));
  const program = new Command();
  program.exitOverride();
  registerAccountsCommands(program);
  await program.parseAsync(["node", "hardkas", "accounts", "balance", ADDRESS, "--network", "simnet", "--provider", "rpc", "--url", "ws://127.0.0.1:18210"]);
  return text;
}

describe("G7 g · accounts balance names the covenant-bound part and the spendable part", () => {
  let dir: string;
  const originalCwd = process.cwd();
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-g7g-display-"));
    fs.writeFileSync(path.join(dir, "hardkas.config.ts"), "export default { defaultNetwork: 'simnet' };");
    process.chdir(dir);
  });
  afterAll(() => {
    process.chdir(originalCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("with covenant UTXOs: Covenant and Spendable lines after Balance, exact KAS", async () => {
    node.balance = 1_500_000_001n;
    node.utxos = [
      { outpoint: { transactionId: "a".repeat(64), index: 0 }, address: ADDRESS, amountSompi: 1_000_000_001n },
      { outpoint: { transactionId: "b".repeat(64), index: 1 }, address: ADDRESS, amountSompi: 500_000_000n, covenantId: COVENANT }
    ];
    const text = await balanceText();
    const lines = text.split(/\r?\n/);
    const at = lines.findIndex((l) => l.startsWith("Balance:"));
    expect(lines[at]).toBe("Balance:  15.00000001 KAS");
    expect(lines[at + 1]).toBe("Covenant: 5 KAS in 1 covenant-bound UTXO(s), not spendable by a payment");
    expect(lines[at + 2]).toBe("Spendable: 10.00000001 KAS");
  });

  it("without covenant UTXOs: no Covenant or Spendable line (the output as before)", async () => {
    node.balance = 30n;
    node.utxos = [{ outpoint: { transactionId: "c".repeat(64), index: 0 }, address: ADDRESS, amountSompi: 30n }];
    const text = await balanceText();
    expect(text).toMatch(/Balance:\s+0\.0000003 KAS/);
    expect(text).not.toMatch(/Covenant:|Spendable:/);
  });
});
