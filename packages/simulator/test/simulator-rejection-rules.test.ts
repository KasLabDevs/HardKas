import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createKaspaSimulator } from "../src/simulator-node.js";
import { deriveAccountFromSeed, signInputForAccount } from "../src/crypto/accounts.js";
import type { KaspaRpcTransaction } from "../src/types.js";

/*
 * SIMULATOR ONLY: the rejection rules the simulator applies, through its in-process RPC. Nothing here is compared with
 * rusty-kaspad (HK-06 / SIM-11, audit 6-nov-2026: this was `differential-rejections.test.ts`, "Zero False-Positives
 * (rusty-kaspad vs kaspa-simulator)", which compared nothing without a node, loaded kaspa-wasm from one machine's
 * absolute path and asserted a rule the node does not have, `RejectInvalidTxId`). Behaviour against the node is the job
 * of the simnet vector suites.
 */

const alice = deriveAccountFromSeed("alice", 0, "simnet");
const bob = deriveAccountFromSeed("bob", 0, "simnet");
const FEE = 300_000n; // above the node's relay floor for 1 input / 2 outputs (203 600 sompi)

const spk = (script: string) => ({ version: 0, scriptPublicKey: script });

function signedPayment(from: typeof alice, utxo: { transactionId: string; index: number; amountSompi: bigint; scriptPublicKey: string }, outputs: Array<{ amount: bigint; script: string }>, payload = ""): KaspaRpcTransaction {
  const sighashTx = {
    version: 0,
    inputs: [{ transactionId: utxo.transactionId, index: utxo.index, sequence: 0n, sigOpCount: 1 }],
    outputs: outputs.map((o) => ({ value: o.amount, scriptPublicKey: { version: 0, script: o.script } })),
    lockTime: 0n,
    subnetworkId: "00".repeat(20),
    gas: 0n,
    payload
  };
  const sigScript = signInputForAccount(from, sighashTx, 0, { amount: utxo.amountSompi, scriptPublicKey: { version: 0, script: utxo.scriptPublicKey } });
  return {
    version: 0,
    inputs: [{ previousOutpoint: { transactionId: utxo.transactionId, index: utxo.index }, signatureScript: sigScript, sequence: 0n, sigOpCount: 1 }],
    outputs: outputs.map((o) => ({ amount: o.amount, scriptPublicKey: spk(o.script) })),
    lockTime: 0n,
    subnetworkId: "00".repeat(20),
    gas: 0n,
    payload
  };
}

describe("Simulator rejection rules (simulator only, no node comparison)", () => {
  let sim: ReturnType<typeof createKaspaSimulator>;
  const fundedUtxo = (account: typeof alice, amount: bigint) => {
    const txId = sim.fund(account.address, amount);
    return { transactionId: txId, index: 0, amountSompi: amount, scriptPublicKey: account.scriptPublicKey };
  };

  beforeAll(() => {
    sim = createKaspaSimulator({ networkId: "simnet", automine: false, bootstrapDevAccounts: true });
  });
  afterAll(() => sim.close());

  it("refuses a transaction with no inputs", async () => {
    const tx: KaspaRpcTransaction = { version: 0, inputs: [], outputs: [{ amount: 100_000_000n, scriptPublicKey: spk(bob.scriptPublicKey) }], lockTime: 0n, subnetworkId: "00".repeat(20), gas: 0n, payload: "" };
    await expect(sim.rpc.submitTransaction(tx)).rejects.toThrow(/inputs/i);
  });

  it("refuses an input whose UTXO does not exist (no orphan pool)", async () => {
    const tx = signedPayment(alice, { transactionId: "99".repeat(32), index: 0, amountSompi: 1_000_000_000n, scriptPublicKey: alice.scriptPublicKey }, [{ amount: 100_000_000n, script: bob.scriptPublicKey }]);
    await expect(sim.rpc.submitTransaction(tx)).rejects.toThrow(/Missing UTXO/i);
  });

  it("refuses duplicate inputs spending the same outpoint", async () => {
    const utxo = fundedUtxo(alice, 1_000_000_000n);
    const once = signedPayment(alice, utxo, [{ amount: 100_000_000n, script: bob.scriptPublicKey }]);
    const tx = { ...once, inputs: [once.inputs[0]!, once.inputs[0]!] };
    await expect(sim.rpc.submitTransaction(tx)).rejects.toThrow(/duplicate input/i);
  });

  it("refuses an output of zero value (TxOutZero, as the node words it)", async () => {
    const utxo = fundedUtxo(alice, 1_000_000_000n);
    const tx = signedPayment(alice, utxo, [{ amount: 0n, script: bob.scriptPublicKey }, { amount: utxo.amountSompi - FEE, script: alice.scriptPublicKey }]);
    await expect(sim.rpc.submitTransaction(tx)).rejects.toThrow(/has zero value/i);
  });

  it("refuses a corrupted signature", async () => {
    const utxo = fundedUtxo(alice, 10_000_000_000n);
    const tx = signedPayment(alice, utxo, [{ amount: 5_000_000_000n, script: bob.scriptPublicKey }, { amount: utxo.amountSompi - 5_000_000_000n - FEE, script: alice.scriptPublicKey }]);
    const bad = { ...tx, inputs: [{ ...tx.inputs[0]!, signatureScript: "41" + "ff".repeat(64) + "01" }] };
    await expect(sim.rpc.submitTransaction(bad)).rejects.toThrow(/signature/i);
  });

  it("refuses a fee below the node's minimum relay fee (100 sompi per gram of compute mass)", async () => {
    const utxo = fundedUtxo(alice, 10_000_000_000n);
    const tx = signedPayment(alice, utxo, [{ amount: 5_000_000_000n, script: bob.scriptPublicKey }, { amount: utxo.amountSompi - 5_000_000_000n - 203_599n, script: alice.scriptPublicKey }]);
    await expect(sim.rpc.submitTransaction(tx)).rejects.toThrow(/RejectInsufficientFee.*minimum relay fee 203600/);
  });

  it("refuses a double spend of an outpoint an unconfirmed transaction already spends", async () => {
    const utxo = fundedUtxo(alice, 10_000_000_000n);
    const tx1 = signedPayment(alice, utxo, [{ amount: 5_000_000_000n, script: bob.scriptPublicKey }, { amount: utxo.amountSompi - 5_000_000_000n - FEE, script: alice.scriptPublicKey }]);
    expect((await sim.rpc.submitTransaction(tx1)).transactionId).toMatch(/^[0-9a-f]{64}$/);
    const tx2 = signedPayment(alice, utxo, [{ amount: 4_000_000_000n, script: bob.scriptPublicKey }, { amount: utxo.amountSompi - 4_000_000_000n - FEE, script: alice.scriptPublicKey }]);
    await expect(sim.rpc.submitTransaction(tx2)).rejects.toThrow(/already spent by unconfirmed mempool transaction/);
  });

  it("refuses a coinbase spend younger than the consensus maturity (1000 DAA scores at 10 BPS)", async () => {
    sim.ledger.addUtxo({ transactionId: "c0".repeat(32), index: 0, address: alice.address, amountSompi: 50_000_000n, scriptPublicKey: alice.scriptPublicKey, blockDaaScore: 1n, isCoinbase: true });
    const tx = signedPayment(alice, { transactionId: "c0".repeat(32), index: 0, amountSompi: 50_000_000n, scriptPublicKey: alice.scriptPublicKey }, [{ amount: 50_000_000n - FEE, script: bob.scriptPublicKey }]);
    await expect(sim.rpc.submitTransaction(tx)).rejects.toThrow(/immature/i);
  });

  it("refuses a transaction whose compute mass exceeds the block limit (500 000)", async () => {
    const utxo = fundedUtxo(alice, 100_000_000n);
    const tx = signedPayment(alice, utxo, [{ amount: utxo.amountSompi - FEE, script: bob.scriptPublicKey }], "aa".repeat(510_000));
    await expect(sim.rpc.submitTransaction(tx)).rejects.toThrow(/RejectMassTooHigh/);
  });

  it("ignores an id the client carries, as the node does (no RejectInvalidTxId rule)", async () => {
    const utxo = fundedUtxo(alice, 1_000_000_000n);
    const tx = signedPayment(alice, utxo, [{ amount: 100_000_000n, script: bob.scriptPublicKey }, { amount: utxo.amountSompi - 100_000_000n - FEE, script: alice.scriptPublicKey }]);
    const res = await sim.rpc.submitTransaction({ ...tx, id: "deadbeef".repeat(8) });
    expect(res.transactionId).toMatch(/^[0-9a-f]{64}$/);
    expect(res.transactionId).not.toBe("deadbeef".repeat(8));
  });
});
