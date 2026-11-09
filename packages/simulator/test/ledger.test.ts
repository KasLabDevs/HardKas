import { describe, it, expect } from "vitest";
import { UtxoLedger } from "../src/index.js";
import type { SimulatorUtxo } from "../src/index.js";

describe("UtxoLedger (In-Memory UTXO State)", () => {
  it("adds, retrieves and calculates balance accurately", () => {
    const ledger = new UtxoLedger();
    const addr = "kaspasim:qqtestaddress";

    const utxo1: SimulatorUtxo = {
      transactionId: "tx1",
      index: 0,
      address: addr,
      amountSompi: 500_000_000n,
      scriptPublicKey: "20" + "11".repeat(32) + "ac",
      blockDaaScore: 10n,
      isCoinbase: false
    };

    const utxo2: SimulatorUtxo = {
      transactionId: "tx2",
      index: 1,
      address: addr,
      amountSompi: 300_000_000n,
      scriptPublicKey: "20" + "11".repeat(32) + "ac",
      blockDaaScore: 12n,
      isCoinbase: false
    };

    ledger.addUtxo(utxo1);
    ledger.addUtxo(utxo2);

    expect(ledger.getBalance(addr)).toBe(800_000_000n);
    expect(ledger.getUtxosByAddress(addr).length).toBe(2);

    // Spend utxo1
    const spent = ledger.spendUtxo("tx1", 0);
    expect(spent).toBeDefined();
    expect(spent!.transactionId).toBe("tx1");

    expect(ledger.getBalance(addr)).toBe(300_000_000n);
    expect(ledger.getUtxosByAddress(addr).length).toBe(1);
  });

  it("enforces coinbase maturity (100 blocks)", () => {
    const maturity = 100n;
    const ledger = new UtxoLedger(maturity);
    const miner = "kaspasim:qqminer";

    const coinbaseUtxo: SimulatorUtxo = {
      transactionId: "cb1",
      index: 0,
      address: miner,
      amountSompi: 50_000_000_000n,
      scriptPublicKey: "20" + "22".repeat(32) + "ac",
      blockDaaScore: 10n,
      isCoinbase: true
    };

    ledger.addUtxo(coinbaseUtxo);

    // At DAA score 50: not mature
    expect(ledger.isSpendable(coinbaseUtxo, 50n)).toBe(false);
    expect(ledger.getUtxosByAddress(miner, 50n).length).toBe(0);
    expect(ledger.getBalance(miner, 50n)).toBe(0n);

    // At DAA score 109: not mature (needs 10 + 100 = 110)
    expect(ledger.isSpendable(coinbaseUtxo, 109n)).toBe(false);

    // At DAA score 110: mature!
    expect(ledger.isSpendable(coinbaseUtxo, 110n)).toBe(true);
    expect(ledger.getUtxosByAddress(miner, 110n).length).toBe(1);
    expect(ledger.getBalance(miner, 110n)).toBe(50_000_000_000n);
  });

  it("clones and restores ledger cleanly", () => {
    const ledger = new UtxoLedger();
    ledger.addUtxo({
      transactionId: "tx1",
      index: 0,
      address: "addr1",
      amountSompi: 100n,
      scriptPublicKey: "mock",
      blockDaaScore: 1n,
      isCoinbase: false
    });

    const clone = ledger.clone();
    expect(clone.getBalance("addr1")).toBe(100n);

    // Modifying clone does not affect original
    clone.spendUtxo("tx1", 0);
    expect(clone.getBalance("addr1")).toBe(0n);
    expect(ledger.getBalance("addr1")).toBe(100n);
  });
});
