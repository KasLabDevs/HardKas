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
import { calculateUpstreamStorageMass, measureBuiltTransactionMass } from "@hardkas/tx-builder";
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

  it("pays at least the SDK minimum fee for the final transaction and commits its storage mass", () => {
    const r = sweep();
    expect(r.outputSompi + r.feeSompi).toBe(utxo.amountSompi);
    const measured = measureBuiltTransactionMass(r.transaction, "simnet");
    expect(r.feeSompi).toBeGreaterThanOrEqual(measured.minimumFeeSompi);
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

  it("uses the canonical entry encoding, not the pre-v1 one", () => {
    const r = sweep();
    const sig = { kind: "bytes" as const, value: Buffer.from(r.signatureScriptHex.slice(2, 132), "hex") };
    const expectedArgs = encodeSilverEntryArgs({ artifact, entry: "release", args: [sig] });
    expect(r.signatureScriptHex.startsWith(expectedArgs)).toBe(true);
  });
});
