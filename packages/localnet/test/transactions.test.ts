import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { 
  createInitialLocalnetState, 
  applySimulatedPayment,
  getAddressBalanceSompi,
  loadOrCreateLocalnetState
} from "../src";

describe("Simulated Transactions", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-test-tx-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should spend sender UTXOs and create recipient/change UTXOs", () => {
    const initialState = createInitialLocalnetState({ accounts: 2, initialBalanceSompi: 1000n });
    const alice = initialState.accounts[0]!.address;
    const bob = initialState.accounts[1]!.address;

    const { state, receipt } = applySimulatedPayment(initialState, {
      from: "alice",
      to: "bob",
      amountSompi: 100n
    });

    // Verify DAA score increment
    expect(state.daaScore).toBe("1");
    expect(receipt.daaScore).toBe("1");

    // Verify Alice's original UTXO is spent
    const aliceSpentUtxos = state.utxos.filter(u => u.address === alice && u.spent);
    expect(aliceSpentUtxos).toHaveLength(1);
    expect(aliceSpentUtxos[0]!.spentAtDaaScore).toBe("1");

    // Verify Bob received a UTXO
    const bobUtxos = state.utxos.filter(u => u.address === bob && !u.spent);
    expect(bobUtxos).toHaveLength(2); // Initial 1000 + new 100
    const receivedUtxo = bobUtxos.find(u => u.amountSompi === "100");
    expect(receivedUtxo).toBeDefined();
    expect(receivedUtxo?.createdAtDaaScore).toBe("1");

    // Verify Alice received change
    const aliceUtxos = state.utxos.filter(u => u.address === alice && !u.spent);
    expect(aliceUtxos).toHaveLength(1);
    const changeAmount = 1000n - 100n - BigInt(receipt.feeSompi);
    expect(aliceUtxos[0]!.amountSompi).toBe(changeAmount.toString());

    // Verify balances
    expect(getAddressBalanceSompi(state, alice)).toBe(changeAmount);
    expect(getAddressBalanceSompi(state, bob)).toBe(1100n);
  });

  it("should return ok:false for insufficient funds", () => {
    const state = createInitialLocalnetState({ accounts: 1, initialBalanceSompi: 100n });
    
    const result = applySimulatedPayment(state, {
      from: "alice",
      to: "bob",
      amountSompi: 200n
    });
    
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/Insufficient funds/i);
  });

  it("should return ok:false for non-positive amount", () => {
    const state = createInitialLocalnetState({ accounts: 1 });
    
    const result = applySimulatedPayment(state, {
      from: "alice",
      to: "bob",
      amountSompi: 0n
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/Amount must be greater than 0/);
  });

  it("should handle address as recipient", () => {
    const state = createInitialLocalnetState({ accounts: 2, initialBalanceSompi: 1000n });
    const bobAddr = state.accounts[1]!.address;

    const { state: nextState } = applySimulatedPayment(state, {
      from: "alice",
      to: bobAddr,
      amountSompi: 100n
    });

    expect(getAddressBalanceSompi(nextState, bobAddr)).toBe(1100n);
  });
});
