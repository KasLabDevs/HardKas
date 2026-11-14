import { describe, it, expect, beforeAll } from "vitest";
import {
  compileSilverScript,
  encodeSilverEntryArgs,
  getSilContract,
  loadManagedKaspaWasmSync,
  silContractBytecodeHex,
  silverP2shLock,
  type SilAbiArtifact
} from "@hardkas/core";
import { calculateUpstreamStorageMass, measureBuiltTransactionMass, measureBuiltTransactionNodeMass } from "@hardkas/tx-builder";
import { buildSilverSweep, type SilverContractUtxo } from "../src/silver-spend.js";

const SOURCE = `pragma silverscript ^0.1.0;

contract SignedRelease(pubkey owner) {
    entry release(sig ownerSig) {
        require(checkSig(ownerSig, owner));
    }
}
`;

const OWNER_KEY = "5d".repeat(32);
const TXID = "cd".repeat(32);

describe("buildSilverSweep", () => {
  let artifact: SilAbiArtifact;
  let bytecode: string;
  let utxo: SilverContractUtxo;
  let to: string;

  beforeAll(async () => {
    const k = loadManagedKaspaWasmSync();
    const owner = new k.PrivateKey(OWNER_KEY);
    const xonly = String(owner.toPublicKey().toXOnlyPublicKey().toString());
    ({ artifact } = await compileSilverScript({
      source: SOURCE,
      constructorArgs: [{ kind: "bytes", value: Buffer.from(xonly, "hex") }]
    }));
    bytecode = silContractBytecodeHex(getSilContract(artifact).contract);
    utxo = {
      outpoint: { transactionId: TXID, index: 0 },
      amountSompi: 1_000_000_000n,
      scriptPublicKey: silverP2shLock(bytecode),
      blockDaaScore: 1234n,
      isCoinbase: false
    };
    to = owner.toKeypair().toAddress("simnet").toString();
  });

  const sweep = (overrides: Partial<Parameters<typeof buildSilverSweep>[0]> = {}) =>
    buildSilverSweep({
      artifact,
      entry: "release",
      args: [{ kind: "signature", privateKey: OWNER_KEY }],
      utxo,
      to,
      networkId: "simnet",
      ...overrides
    });

  it("unlocks with a real signature, the dispatch tag and the pushed redeem script", () => {
    const r = sweep();
    const sigScript = r.signatureScriptHex;
    const tag = getSilContract(artifact).contract.entries.release!.dispatch_tag;
    // OP_DATA_65 <sig+SIGHASH_ALL> OP_DATA_4 <tag> <push bytecode>
    expect(sigScript.slice(0, 2)).toBe("41");
    expect(sigScript.slice(130, 132)).toBe("01");
    expect(sigScript.slice(132, 142)).toBe("04" + tag);
    expect(sigScript.slice(142)).toMatch(new RegExp(`${bytecode}$`));
    expect(r.rpcTransaction.inputs[0]).toMatchObject({
      previousOutpoint: { transactionId: TXID, index: 0 },
      signatureScript: sigScript,
      sequence: 0,
      sigOpCount: 1
    });
    expect(r.txId).toMatch(/^[0-9a-f]{64}$/);
  });

  // G3: CHANGED EXPECTATION. Old: the fee was at least the SDK's minimum (kaspa-wasm calculateTransactionFee, which also
  // adds a signature allowance to the signed transaction and charges the storage mass). New: the fee is the node's relay
  // floor of the final transaction (100 sompi/g of its compute mass), which rusty-kaspad accepts and refuses one sompi
  // under (silver-v0-node-floor-g3.simnet.test.ts); the SDK's figure is never below it.
  it("pays the node's relay floor for the final transaction and commits its storage mass", () => {
    const r = sweep();
    expect(r.outputSompi + r.feeSompi).toBe(utxo.amountSompi);
    const node = measureBuiltTransactionNodeMass(r.transaction, {
      inputs: [{ amountSompi: utxo.amountSompi, scriptBytes: utxo.scriptPublicKey.script.length / 2, covenantId: false }],
      outputs: [{ amountSompi: r.outputSompi, scriptBytes: 34, covenantId: false }]
    });
    expect(r.feeSompi).toBe(node.minimumFeeSompi);
    expect(r.feeSompi).toBeLessThanOrEqual(measureBuiltTransactionMass(r.transaction, "simnet").minimumFeeSompi);
    expect(r.storageMass).toBe(calculateUpstreamStorageMass([utxo.amountSompi], [r.outputSompi], "simnet"));
    expect(BigInt(r.rpcTransaction.storageMass)).toBe(r.storageMass);
    expect(BigInt(r.rpcTransaction.outputs[0].amount)).toBe(r.outputSompi);
  });

  it("signs the spend it builds (a different key gives a different signature, same size)", () => {
    const a = sweep();
    const b = sweep({ args: [{ kind: "signature", privateKey: "6e".repeat(32) }] });
    expect(b.signatureScriptHex.length).toBe(a.signatureScriptHex.length);
    expect(b.signatureScriptHex.slice(2, 130) === a.signatureScriptHex.slice(2, 130)).toBe(false);
    expect(b.signatureScriptHex.slice(130)).toBe(a.signatureScriptHex.slice(130));
  });

  it("carries the requested input sequence (relative locks) into the signed transaction", () => {
    const plain = sweep();
    const locked = sweep({ sequence: 500n });
    expect(locked.rpcTransaction.inputs[0].sequence).toBe(500);
    // The txid and the signature both commit to the sequence.
    expect(locked.txId === plain.txId).toBe(false);
    expect(locked.signatureScriptHex.slice(2, 130) === plain.signatureScriptHex.slice(2, 130)).toBe(false);
  });

  it("refuses an output not locked to this contract", () => {
    const other = { ...utxo, scriptPublicKey: { version: 0, script: "aa20" + "00".repeat(32) + "87" } };
    expect(() => sweep({ utxo: other })).toThrow(expect.objectContaining({ code: "SILVER_SPEND_LOCK_MISMATCH" }));
  });

  it("refuses a value that cannot pay its fee, a bad recipient and a bad call", () => {
    expect(() => sweep({ utxo: { ...utxo, amountSompi: 1000n } })).toThrow(expect.objectContaining({ code: "SILVER_SPEND_INSUFFICIENT_VALUE" }));
    expect(() => sweep({ to: "kaspasim:nope" })).toThrow(expect.objectContaining({ code: "SILVER_SPEND_INVALID_RECIPIENT" }));
    expect(() => sweep({ entry: "steal" })).toThrow(expect.objectContaining({ code: "SILVER_ABI_UNKNOWN_ENTRY" }));
    expect(() => sweep({ args: [] })).toThrow(expect.objectContaining({ code: "SILVER_ABI_ARGUMENT_INVALID" }));
  });

  it("G3 a small coin, whose storage-inclusive SDK fee is above its value, sweeps at the node's floor; one whose output would exceed the node's storage limit is refused", () => {
    // 0.025 KAS: the SDK charged 100 × max(compute, storage ≈ 50,000 g) ≈ 5,000,000 sompi, twice the coin
    const small = sweep({ utxo: { ...utxo, amountSompi: 2_500_000n } });
    expect(small.outputSompi + small.feeSompi).toBe(2_500_000n);
    expect(small.feeSompi).toBeLessThan(500_000n);
    const storage = calculateUpstreamStorageMass([2_500_000n], [small.outputSompi], "simnet");
    expect(storage * 100n).toBeGreaterThan(2_500_000n);
    // 0.005 KAS: what the floor leaves is so small that the storage mass passes 500,000 g
    expect(() => sweep({ utxo: { ...utxo, amountSompi: 500_000n } })).toThrow(
      expect.objectContaining({ code: "TX_MASS_ABOVE_STANDARD_LIMIT", message: expect.stringMatching(/storage mass \d+ g is above the node's limit of 500000 g/) })
    );
  });

  it("G3 a fee rate at or below the relay minimum pays the floor; a priority rate above it is priced on the SDK's mass", () => {
    const floor = sweep();
    expect(sweep({ feeRateSompiPerGram: 100n }).feeSompi).toBe(floor.feeSompi);
    const fast = sweep({ feeRateSompiPerGram: 1000n });
    expect(fast.feeSompi).toBe(fast.mass * 1000n);
    expect(fast.feeSompi).toBeGreaterThan(floor.feeSompi);
  });

  it("G7-e refuses a recipient address of another network (prefix), before anything is signed", () => {
    const k = loadManagedKaspaWasmSync();
    const testnet = new k.PrivateKey(OWNER_KEY).toKeypair().toAddress("testnet-10").toString();
    expect(() => sweep({ to: testnet })).toThrow(expect.objectContaining({ code: "NETWORK_ADDRESS_MISMATCH" }));
    expect(() => sweep({ to: testnet, networkId: "testnet-10" })).not.toThrow();
  });

  it("uses the canonical entry encoding, not the pre-v1 one", () => {
    const r = sweep();
    const sig = { kind: "bytes" as const, value: Buffer.from(r.signatureScriptHex.slice(2, 132), "hex") };
    const expectedArgs = encodeSilverEntryArgs({ artifact, entry: "release", args: [sig] });
    expect(r.signatureScriptHex.startsWith(expectedArgs)).toBe(true);
  });
});
