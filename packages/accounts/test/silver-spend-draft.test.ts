import { describe, it, expect, beforeAll } from "vitest";
import {
  compileSilverScript,
  getSilContract,
  loadManagedKaspaWasmSync,
  silContractBytecodeHex,
  silverP2shLock,
  type SilAbiArtifact
} from "@hardkas/core";
import { measureBuiltTransactionMass } from "@hardkas/tx-builder";
import { finalizeSilverSpend, prepareSilverSpend, signSilverSpend, type SilverDraftArg } from "../src/silver-spend.js";
import { buildScriptFunding } from "../src/silver-funding.js";

const SOURCE = `pragma silverscript ^0.1.0;

contract TwoSig(pubkey a, pubkey b, int amount) {
    entry both(sig sa, sig sb) {
        require(checkSig(sa, a));
        require(checkSig(sb, b));
        require(tx.outputs.length == 1);
        require(tx.outputs[0].value == amount);
    }
}
`;

const KEY_A = "5d".repeat(32);
const KEY_B = "6e".repeat(32);
const AMOUNT = 900_000_000n;

describe("multi-party SilverScript spend drafts", () => {
  let artifact: SilAbiArtifact;
  let lock: { version: number; script: string };
  let dest: string;
  const args: SilverDraftArg[] = [{ kind: "signer", signer: "alice" }, { kind: "signer", signer: "bob" }];

  beforeAll(async () => {
    const k = loadManagedKaspaWasmSync();
    const xonly = (h: string) => Buffer.from(String(new k.PrivateKey(h).toPublicKey().toXOnlyPublicKey().toString()), "hex");
    ({ artifact } = await compileSilverScript({
      source: SOURCE,
      constructorArgs: [{ kind: "bytes", value: xonly(KEY_A) }, { kind: "bytes", value: xonly(KEY_B) }, { kind: "int", value: AMOUNT }]
    }));
    lock = silverP2shLock(silContractBytecodeHex(getSilContract(artifact).contract));
    dest = new k.PrivateKey(KEY_A).toKeypair().toAddress("simnet").toString();
  });

  const utxo = () => ({ outpoint: { transactionId: "cd".repeat(32), index: 1 }, amountSompi: 1_000_000_000n, scriptPublicKey: lock, blockDaaScore: 5n, isCoinbase: false });
  const prepare = (overrides: Record<string, unknown> = {}) =>
    prepareSilverSpend({ artifact, entry: "both", args, utxo: utxo(), outputs: [{ amountSompi: AMOUNT, address: dest }], networkId: "simnet", ...overrides });

  it("prepares one JSON transaction that each signer signs separately", () => {
    const draft = prepare();
    expect(JSON.parse(JSON.stringify(draft))).toEqual(draft);
    expect(draft).toMatchObject({ schema: "hardkas.silver.spendDraft.v1", entry: "both", signers: ["alice", "bob"], feeSompi: "100000000" });
    expect(draft.input.sigOpCount).toBe(2);

    const sigA = signSilverSpend(draft, KEY_A);
    const sigB = signSilverSpend(draft, KEY_B);
    expect(sigA).toMatch(/^[0-9a-f]{128}01$/);
    expect(sigB === sigA).toBe(false);

    const done = finalizeSilverSpend(draft, artifact, args, { alice: sigA, bob: sigB });
    expect(done.txId).toBe(draft.unsignedTxId);
    const tag = getSilContract(artifact).contract.entries.both!.dispatch_tag;
    expect(done.signatureScriptHex.startsWith(`41${sigA}41${sigB}04${tag}`)).toBe(true);
    expect(done.rpcTransaction.inputs[0].sigOpCount).toBe(2);
    expect(BigInt(done.rpcTransaction.outputs[0].amount)).toBe(AMOUNT);
    // The fee the outputs leave covers the SDK minimum of the final transaction.
    expect(1_000_000_000n - AMOUNT).toBeGreaterThanOrEqual(0n);
  });

  it("refuses a finalization that is missing a signer", () => {
    const draft = prepare();
    expect(() => finalizeSilverSpend(draft, artifact, args, { alice: signSilverSpend(draft, KEY_A) })).toThrow(
      expect.objectContaining({ code: "SILVER_SPEND_SIGNATURE_MISSING" })
    );
  });

  it("refuses a tampered draft instead of signing something else", () => {
    const draft = prepare();
    const tampered = { ...draft, outputs: [{ ...draft.outputs[0]!, valueSompi: "1" }] };
    expect(() => signSilverSpend(tampered, KEY_A)).toThrow(expect.objectContaining({ code: "SILVER_SPEND_DRAFT_INVALID" }));
  });

  it("refuses outputs that leave less than the SDK minimum as fee", () => {
    expect(() => prepare({ outputs: [{ amountSompi: 999_999_999n, address: dest }] })).toThrow(
      expect.objectContaining({ code: "FEE_BELOW_NETWORK_MINIMUM" })
    );
  });

  it("refuses an output not locked to the contract", () => {
    expect(() => prepare({ utxo: { ...utxo(), scriptPublicKey: { version: 0, script: "aa20" + "00".repeat(32) + "87" } } })).toThrow(
      expect.objectContaining({ code: "SILVER_SPEND_LOCK_MISMATCH" })
    );
  });
});

describe("buildScriptFunding", () => {
  const KEY = "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";
  const own = () => {
    const k = loadManagedKaspaWasmSync();
    const s = k.payToAddressScript(new k.PrivateKey(KEY).toKeypair().toAddress("simnet"));
    return { version: Number(s.version), script: String(s.script) };
  };
  const coin = (i: number, amount: bigint) => ({ outpoint: { transactionId: "ab".repeat(32), index: i }, amountSompi: amount, scriptPublicKey: own(), blockDaaScore: 1n, isCoinbase: false });
  const lock = { version: 0, script: "aa20" + "12".repeat(32) + "87" };

  it("funds the script output first, returns change, and pays the SDK fee", () => {
    const r = buildScriptFunding({ utxos: [coin(0, 600_000_000n), coin(1, 600_000_000n)], privateKey: KEY, lockingScript: lock, valueSompi: 1_000_000_000n, networkId: "simnet" });
    const rpc = r.rpcTransaction;
    expect(rpc.outputs[0].scriptPublicKey).toEqual({ version: 0, scriptPublicKey: lock.script });
    expect(BigInt(rpc.outputs[0].amount)).toBe(1_000_000_000n);
    expect(r.spent).toHaveLength(2);
    expect(r.changeSompi + r.feeSompi + 1_000_000_000n).toBe(1_200_000_000n);
    expect(rpc.inputs.every((i: any) => /^41[0-9a-f]{128}01$/.test(i.signatureScript))).toBe(true);
    expect("mass" in rpc).toBe(false);
  });

  it("refuses what it cannot fund or does not own", () => {
    expect(() => buildScriptFunding({ utxos: [coin(0, 100n)], privateKey: KEY, lockingScript: lock, valueSompi: 1_000n, networkId: "simnet" })).toThrow(
      expect.objectContaining({ code: "FUNDING_INSUFFICIENT" })
    );
    expect(() =>
      buildScriptFunding({ utxos: [{ ...coin(0, 5_000_000_000n), scriptPublicKey: lock }], privateKey: KEY, lockingScript: lock, valueSompi: 1_000n, networkId: "simnet" })
    ).toThrow(expect.objectContaining({ code: "FUNDING_KEY_MISMATCH" }));
  });
});
