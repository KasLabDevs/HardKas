import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { createBalancedTransaction, createScriptTransaction } from "../src/wasm-transaction.js";
import { KaspaWasmPrivateKeySigner } from "../src/kaspa-wasm-signer.js";
import { KaspaSdkRealTxSigner } from "../src/kaspa-sdk-real-signer.js";
import { parseWasmTxToRpc } from "../src/internal/wasm-rpc-serialization.js";

// -----------------------------------------------------------------------------
// TX-SEQUENCE-1 (2026-10-21). The real simnet run of TX-BATCH-1 had a payment refused by rusty-kaspad 2.1.0 with
// "one of the transaction sequence locks conditions was not met". HardKAS builds payments with kaspa-wasm's
// `createTransaction`, which numbers the inputs' `sequence` 0, 1, 2… (rusty-kaspa wallet/core/src/wasm/tx/utils.rs:
// `.enumerate()` … `sequence as u64`). In Kaspa a sequence without the disable bit (1 << 63) is a RELATIVE LOCK in
// DAA (consensus check_sequence_lock: block_daa_score + (sequence & 0xffffffff) - 1 >= virtual DAA => refused): input k
// cannot spend a UTXO the node accepted less than k DAA ago. An ordinary payment sets no time condition, so every input
// now gets sequence 0 and the transaction is finalized again (its id covers the sequences). Covenant (V1) transactions
// keep the SDK's numbering ("as-built"), exactly as before; script builders were already at 0.
// Real pinned kaspa-wasm, no network.
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
let k: any;
let officialTxIdOf: (rpcTx: unknown) => string;
let pk: any;
let address: string;
let spk: any;

const KAS = 100_000_000n;
const utxo = (n: number, daa = 1000n) => ({
  address,
  outpoint: { transactionId: (n + 1).toString(16).padStart(64, "c"), index: n },
  utxoEntry: { amount: 10n * KAS, scriptPublicKey: spk, blockDaaScore: daa, isCoinbase: false }
});
/** n inputs of 10 KAS paying everything but the fee to one output. */
function build(n: number, fee = 20_000n, extra: Record<string, unknown> = {}) {
  const utxos = Array.from({ length: n }, (_, i) => utxo(i));
  const total = 10n * KAS * BigInt(n);
  const output = { amountSompi: total - fee, output: new k.PaymentOutput(new k.Address(address), total - fee) };
  return createBalancedTransaction(k, { utxos, outputs: [output], feeSompi: fee, ...extra } as any);
}
const seqs = (tx: any) => tx.inputs.map((i: any) => BigInt(i.sequence));
const official = (signed: any) => officialTxIdOf(parseWasmTxToRpc(signed.serializeToObject()));

beforeAll(async () => {
  k = loadManagedKaspaWasmSync();
  officialTxIdOf = (await import(pathToFileURL(path.join(repoRoot, "packages", "kaspa-rpc", "dist", "index.js")).href)).officialTxIdOf;
  pk = new k.PrivateKey("22".repeat(32));
  address = pk.toKeypair().toAddress("simnet").toString();
  spk = k.payToAddressScript(address);
});

describe("TX-SEQUENCE-1 · ordinary payments carry sequence 0 on every input", () => {
  it("kaspa-wasm itself numbers the inputs (the layer that introduces sequence = index)", () => {
    const raw = k.createTransaction([utxo(0), utxo(1), utxo(2)], [new k.PaymentOutput(new k.Address(address), 30n * KAS - 20_000n)], 20_000n);
    expect(seqs(raw)).toEqual([0n, 1n, 2n]);
  });

  it("one input: sequence 0 and the very same transaction id as the SDK builds (single-input payments do not change)", () => {
    const raw = k.createTransaction([utxo(0)], [new k.PaymentOutput(new k.Address(address), 10n * KAS - 20_000n)], 20_000n);
    const tx = build(1);
    expect(seqs(tx)).toEqual([0n]);
    expect(tx.id).toBe(raw.id);
  });

  it("two inputs: sequence 0 on both, the id is recomputed, and the signed id is the official id of the payload", () => {
    const tx = build(2);
    expect(seqs(tx)).toEqual([0n, 0n]);
    const asBuilt = build(2, 20_000n, { inputSequences: "as-built" });
    expect(tx.id, "the id covers the sequences").not.toBe(asBuilt.id);
    const signed = k.signTransaction(tx, [pk], true);
    expect(seqs(signed)).toEqual([0n, 0n]);
    expect(signed.id).toBe(official(signed));
  });

  it("five inputs: sequence 0 on all, signed id = official id", () => {
    const signed = k.signTransaction(build(5), [pk], true);
    expect(seqs(signed)).toEqual([0n, 0n, 0n, 0n, 0n]);
    expect(signed.id).toBe(official(signed));
  });

  it("every input is signed over the finalized transaction: a Schnorr signature script on each, sequence 0 kept after signing", () => {
    // (kaspa-wasm signs with fresh randomness, so two signatures of the same content differ: no offline check can tell
    // what a signature covers; a real node verifies them)
    const tx = build(3);
    const idBeforeSigning = tx.id;
    const signed = k.signTransaction(tx, [pk], true);
    for (const input of signed.inputs) expect(String(input.signatureScript)).toMatch(/^41[0-9a-f]{128}01$/); // push 65 · schnorr 64 · SIGHASH_ALL
    expect(seqs(signed)).toEqual([0n, 0n, 0n]);
    expect(signed.id).toBe(idBeforeSigning);
  });

  it("amounts, fee and mass are unchanged: value is conserved and the mass the fee was priced on is the same", () => {
    const fee = 20_000n;
    const fixed = build(2, fee);
    const asBuilt = build(2, fee, { inputSequences: "as-built" });
    const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
    const ins = sum(fixed.inputs.map((i: any) => BigInt(i.utxo?.amount ?? 10n * KAS)));
    const outs = sum(fixed.outputs.map((o: any) => BigInt(o.value)));
    expect(ins - outs).toBe(fee);
    expect(k.calculateTransactionMass("simnet", fixed)).toBe(k.calculateTransactionMass("simnet", asBuilt));
    // a plan that does not balance is still refused before anything is built
    expect(() => createBalancedTransaction(k, { utxos: [utxo(0)], outputs: [{ amountSompi: 1n, output: new k.PaymentOutput(new k.Address(address), 1n) }], feeSompi: 1n })).toThrow(/TX_VALUE_NOT_CONSERVED/);
  });

  it('"as-built" keeps the SDK numbering (the covenant V1 path, unchanged)', () => {
    expect(seqs(build(3, 20_000n, { inputSequences: "as-built" }))).toEqual([0n, 1n, 2n]);
  });

  it("script transactions keep their explicit sequence 0 (createScriptTransaction is not touched)", () => {
    const tx = createScriptTransaction(k, {
      utxos: [utxo(0), utxo(1)],
      outputs: [{ value: 20n * KAS - 20_000n, scriptPublicKey: spk }],
      feeSompi: 20_000n
    });
    expect(seqs(tx)).toEqual([0n, 0n]);
  });
});

describe("TX-SEQUENCE-1 · the HardKAS signers", () => {
  const plan = (n: number): any => ({
    schema: "hardkas.txPlan",
    networkId: "simnet",
    mode: "rpc",
    from: { address, input: "payer" },
    to: { address, input: "payer" },
    amountSompi: String(5n * KAS),
    inputs: Array.from({ length: n }, (_, i) => ({
      outpoint: { transactionId: (i + 1).toString(16).padStart(64, "d"), index: i },
      address,
      amountSompi: String(10n * KAS),
      scriptPublicKey: Number(spk.version).toString(16).padStart(4, "0") + String(spk.script),
      blockDaaScore: "1000",
      isCoinbase: false
    })),
    outputs: [{ address, amountSompi: String(5n * KAS) }],
    change: { address, amountSompi: String(10n * KAS * BigInt(n) - 5n * KAS - 30_000n) },
    estimatedFeeSompi: "30000",
    estimatedMass: "3000"
  });
  const payloadOf = (signed: any) => JSON.parse(signed.signedTransaction.payload);

  it("KaspaWasmPrivateKeySigner (tx sign, tx send, tx batch, SDK): every input at sequence 0, declared txId = official id", async () => {
    for (const n of [1, 2, 4]) {
      const signer = new KaspaWasmPrivateKeySigner({ account: { name: "payer", kind: "kaspa", network: "simnet", address, privateKey: pk.toString() } as any });
      const signed = await signer.signTxPlan({ planArtifact: plan(n) } as any);
      const rpcTx = payloadOf(signed);
      expect(rpcTx.inputs.map((i: any) => BigInt(i.sequence)), `${n} input(s)`).toEqual(Array(n).fill(0n));
      expect(signed.txId, `${n} input(s)`).toBe(officialTxIdOf(rpcTx));
    }
  });

  it("KaspaSdkRealTxSigner: every input at sequence 0, txId = official id", async () => {
    const signer = new KaspaSdkRealTxSigner({ sdkLoader: async () => k });
    const signed: any = await signer.sign({ plan: plan(3), account: { name: "payer", address, privateKey: pk.toString(), createdAt: "" } as any });
    const tx = signed.signedTransaction.raw;
    expect(seqs(tx)).toEqual([0n, 0n, 0n]);
    expect(signed.txId).toBe(official(tx));
  });
});
