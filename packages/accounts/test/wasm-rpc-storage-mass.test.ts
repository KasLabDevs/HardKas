import { describe, it, expect } from "vitest";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { parseWasmTxToRpc } from "../src/internal/wasm-rpc-serialization.js";

// Regression (M8-B2-A): the SDK object has `storageMass` and no `mass`; emitting
// `mass: 0` beside a non-zero `storageMass` made the node refuse the transaction
// with "request deserialization error".
describe("parseWasmTxToRpc storage mass", () => {
  const build = (storageMass: bigint, version = 1) => {
    const k = loadManagedKaspaWasmSync();
    const spk = new k.ScriptPublicKey(0, "20" + "11".repeat(32) + "ac");
    const op = { transactionId: "ab".repeat(32), index: 0 };
    const tx = new k.Transaction({
      version,
      inputs: [{
        previousOutpoint: op, signatureScript: "41" + "00".repeat(65), sequence: 0n,
        sigOpCount: version === 1 ? 0 : 1, computeBudget: version === 1 ? 10 : 0,
        utxo: { outpoint: op, amount: 5_000_000_000n, scriptPublicKey: spk, blockDaaScore: 0n, isCoinbase: false }
      }],
      outputs: [{ value: 1_000_000_000n, scriptPublicKey: new k.ScriptPublicKey(0, "20" + "22".repeat(32) + "ac") }],
      lockTime: 0n, subnetworkId: "0000000000000000000000000000000000000000", gas: 0n, payload: ""
    });
    tx.storageMass = storageMass;
    return tx;
  };

  it("emits the transaction's storageMass and no legacy mass", () => {
    for (const version of [0, 1]) {
      const rpc = parseWasmTxToRpc(build(1234n, version).serializeToObject());
      expect(rpc.storageMass).toBe(1234);
      expect("mass" in rpc).toBe(false);
    }
  });

  it("keeps a zero commitment as zero", () => {
    expect(parseWasmTxToRpc(build(0n).serializeToObject()).storageMass).toBe(0);
  });

  it("reads the deprecated mass alias of older serializations", () => {
    const legacy = { ...build(0n).serializeToObject(), storageMass: undefined, mass: 99 };
    expect(parseWasmTxToRpc(legacy).storageMass).toBe(99);
  });
});
