import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { measureBuiltTransactionMass, measureBuiltTransactionNodeMass } from "../src/mass.js";
import { priorityFeeRate } from "../src/fee-policy.js";
import { v1FeeMass, v1MinimumRelayFee, v1NonContextualMasses, v1StorageMass } from "../src/v1-mass.js";

/*
 * G3 · measureBuiltTransactionNodeMass: the node's floor and mass limits of a built WASM transaction (the figures the
 * v0 SilverScript and covenant builders now price on), against the SDK's calculateTransactionMass/Fee, which charges the
 * storage mass and calls everything above 100,000 g non-standard. The node's behaviour itself is proven on rusty-kaspad
 * 2.1.0 by packages/testing/test/silver-v0-node-floor-g3.simnet.test.ts.
 */

const k: any = loadManagedKaspaWasmSync();
const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const KEY = hex("g3-node-mass-key");
const address = new k.PrivateKey(KEY).toPublicKey().toAddress("simnet").toString();
const own = k.payToAddressScript(new k.Address(address));
const P2PK_SIG = "41" + "00".repeat(65);
const TXID = hex("g3-node-mass-utxo");

/** One P2PK input of `amount`, outputs to the same key; the unlock at its final (signed) length when `signed`. */
function p2pkTx(amount: bigint, outputs: bigint[], signed = true) {
  const tx = new k.Transaction({
    version: 0,
    inputs: [
      {
        previousOutpoint: { transactionId: TXID, index: 0 },
        signatureScript: signed ? P2PK_SIG : "",
        sequence: 0n,
        sigOpCount: 1,
        utxo: { outpoint: { transactionId: TXID, index: 0 }, amount, scriptPublicKey: own, blockDaaScore: 0n, isCoinbase: false }
      }
    ],
    outputs: outputs.map((value) => ({ value, scriptPublicKey: own })),
    lockTime: 0n,
    subnetworkId: "0000000000000000000000000000000000000000",
    gas: 0n,
    payload: ""
  });
  return tx;
}
const cells = (amount: bigint, outputs: bigint[]) => ({
  inputs: [{ amountSompi: amount, scriptBytes: 34, covenantId: false }],
  outputs: outputs.map((amountSompi) => ({ amountSompi, scriptBytes: 34, covenantId: false }))
});

describe("G3 · the node's relay floor and mass limits of a built transaction", () => {
  it("a v0 P2PK payment + change: HK-09's 203,600 sompi floor, read from the transaction's own fields", () => {
    const m = measureBuiltTransactionNodeMass(p2pkTx(1000n * 100_000_000n, [20_000_000n, 99_979_796_400n]), cells(1000n * 100_000_000n, [20_000_000n, 99_979_796_400n]));
    const byShape = v1MinimumRelayFee(
      v1FeeMass(v1NonContextualMasses({ version: 0, inputs: [{ signatureScriptBytes: 66, sigOpCount: 1 }], outputs: [{ scriptBytes: 34, covenant: false }, { scriptBytes: 34, covenant: false }], payloadBytes: 0 }))
    );
    expect(byShape).toBe(203_600n);
    expect(m.minimumFeeSompi).toBe(byShape);
    expect(m.computeMass).toBe(2_036n);
    expect(m.relayable).toBe(true);
    expect(m.limits).toEqual({ compute: 100_000n, storage: 500_000n, transient: 1_000_000n });
  });

  it("storage mass is no fee floor: a small output's storage mass binds the SDK's fee, not the node's", () => {
    const amount = 100_000_000n;
    const outs = [8_000_000n, amount - 8_000_000n - 203_600n];
    const node = measureBuiltTransactionNodeMass(p2pkTx(amount, outs), cells(amount, outs));
    const sdk = measureBuiltTransactionMass(p2pkTx(amount, outs, false), "simnet");
    expect(node.storageMass).toBe(v1StorageMass(cells(amount, outs).inputs, cells(amount, outs).outputs));
    expect(node.storageMass).toBeGreaterThan(100_000n);
    expect(node.minimumFeeSompi).toBe(203_600n);
    // the SDK calls it non-standard (mass = the storage mass, above 100,000 g) and prices no fee
    expect(sdk.mass).toBeGreaterThanOrEqual(node.storageMass);
    expect(sdk.standard).toBe(false);
    expect(node.relayable).toBe(true);
  });

  it("storage mass above the block limit (500,000 g): not relayable, the storage mass named", () => {
    const amount = 100_000_000n;
    const outs = [1_500_000n, amount - 1_500_000n - 203_600n];
    const m = measureBuiltTransactionNodeMass(p2pkTx(amount, outs), cells(amount, outs));
    expect(m.relayable).toBe(false);
    expect(m.exceeded).toMatchObject({ mass: "storage", limit: 500_000n });
    expect(m.exceededText).toMatch(/^storage mass \d+ g is above the node's limit of 500000 g/);
  });

  it("an explicit storage mass (a covenant builder's committed node-rule value) is used as given", () => {
    const m = measureBuiltTransactionNodeMass(p2pkTx(100_000_000n, [99_000_000n]), { storageMass: 600_000n });
    expect(m.storageMass).toBe(600_000n);
    expect(m.relayable).toBe(false);
  });

  it("a fee rate buys priority only above the relay minimum (FEE-POLICY-1)", () => {
    expect(priorityFeeRate(undefined)).toBeUndefined();
    expect(priorityFeeRate(1n)).toBeUndefined();
    expect(priorityFeeRate(100n)).toBeUndefined();
    expect(priorityFeeRate(101n)).toBe(101n);
  });
});
