import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInitialLocalnetState, saveLocalnetState, getDefaultLocalnetStatePath, LocalnetSimulatedProvider } from "../src/index.js";

// -----------------------------------------------------------------------------
// SIM-OUTPOINT-1 (2026-10-21). Found by the security audit of 2026-10-21 (SA-5): the simulator's RPC stand-in
// (LocalnetSimulatedProvider, the `rpc` of every simulated SDK instance) turned a simulator UTXO id into an outpoint by
// splitting it on ":" and taking parts [1] and [2]. The simulator writes its ids as `<txId>:<index>` (a payment's
// outputs, the genesis funds), so every UTXO came out as { transactionId: "0" or "1", index: 0 }: two UTXOs of one address
// carried the same outpoint, and none named its transaction. Fixed: the outpoint is the id split at its LAST ":" — the
// transaction part and the output index — so `${transactionId}:${index}` is the simulator's id again, for every id
// format it writes (the legacy `faucet:<addr>:<daa>:<n>` too).
// -----------------------------------------------------------------------------

const TX_A = "a1".repeat(32);
const TX_B = "b2".repeat(32);

describe("SIM-OUTPOINT-1 · the simulated provider's outpoints name the simulator's UTXOs", () => {
  let ws: string;
  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-simop1-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
  });
  afterEach(() => fs.rmSync(ws, { recursive: true, force: true }));

  it("outputs paid to one address by two transactions: distinct outpoints, each naming its transaction and its output index", async () => {
    const state: any = createInitialLocalnetState({ accounts: 2 });
    const bob = state.accounts[1].address;
    state.utxos.push(
      { id: `${TX_A}:0`, address: bob, amountSompi: "100000000", spent: false, createdAtDaaScore: "5" },
      { id: `${TX_B}:1`, address: bob, amountSompi: "200000000", spent: false, createdAtDaaScore: "6" }
    );
    await saveLocalnetState(state, getDefaultLocalnetStatePath(ws));
    const utxos = await new LocalnetSimulatedProvider(ws).getUtxosByAddress(bob);
    const keys = utxos.map((u: any) => `${u.outpoint.transactionId}:${u.outpoint.index}`);
    expect(new Set(keys).size, JSON.stringify(keys)).toBe(utxos.length);
    expect(keys.sort()).toEqual(state.utxos.filter((u: any) => u.address === bob).map((u: any) => u.id).sort());
    const paidByB = utxos.find((u: any) => u.outpoint.transactionId === TX_B);
    expect(paidByB?.outpoint.index).toBe(1);
    expect(paidByB?.amountSompi).toBe(200_000_000n);
  });

  it("every id format the simulator writes round-trips through the outpoint (genesis `<txId>:0`, the legacy faucet form)", async () => {
    const state: any = createInitialLocalnetState({ accounts: 1 });
    const alice = state.accounts[0].address;
    state.utxos.push({ id: "faucet:12345678:7:3", address: alice, amountSompi: "5", spent: false, createdAtDaaScore: "7" });
    await saveLocalnetState(state, getDefaultLocalnetStatePath(ws));
    const utxos = await new LocalnetSimulatedProvider(ws).getUtxosByAddress(alice);
    expect(utxos.map((u: any) => `${u.outpoint.transactionId}:${u.outpoint.index}`).sort()).toEqual(
      state.utxos.filter((u: any) => u.address === alice).map((u: any) => u.id).sort()
    );
    const genesis = utxos.find((u: any) => /^[0-9a-f]{64}$/.test(u.outpoint.transactionId));
    expect(genesis?.outpoint.index).toBe(0);
  });
});
