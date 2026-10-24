import { describe, it, expect, beforeAll, vi } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadManagedKaspaWasmSync, systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { createTxPlanArtifact, expectedScriptPublicKeyHex } from "@hardkas/artifacts";
import { TxPlanService } from "@hardkas/tx-builder";
import { KaspaWasmPrivateKeySigner } from "../src/kaspa-wasm-signer.js";
import { PrivateKeyAuthorizer } from "../src/authorizers.js";

// -----------------------------------------------------------------------------
// V1-TXID-1 (2026-10-21). Found while fixing TX-SEQUENCE-1 (probe v1-id-probe): the internal signer builds a version-1
// transaction with kaspa-wasm and then sets its version, storage mass, compute budgets and sig-op counts — all fields
// its id covers — without finalize(). kaspa-wasm recomputes a transaction's id only on finalize(), so the txId the
// signer declared was the id of the transaction AS BUILT (version 0), not of the one it signed and serialized. Since
// EXPECTED-TXID-1 that declared txId is checked against the official id of the payload, and every v1 send was refused
// (SIGNED_TXID_MISMATCH); before it, a v1 submission would have been recorded under a txId that is not its own.
// Fixed: the signer finalizes the transaction once those fields are set, before any input is signed.
// The signatures are checked offline with kaspa-wasm's own consensus verifier: signTransaction(tx, [], true) on the
// transaction the payload describes, populated with its UTXO entries, signs nothing (no key) and verifies every
// signature script already on it (a flipped byte fails with IncorrectSignature). Real pinned kaspa-wasm, no network.
// -----------------------------------------------------------------------------

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const repoRoot = path.resolve(__dirname, "../../..");
let k: any;
let officialTxIdOf: (rpcTx: unknown) => string;
const KEY_A = "1111".padStart(64, "0");
const KEY_B = "2222".padStart(64, "0");
let alice: string;
let bob: string;

beforeAll(async () => {
  k = loadManagedKaspaWasmSync();
  officialTxIdOf = (await import(pathToFileURL(path.join(repoRoot, "packages", "kaspa-rpc", "dist", "index.js")).href)).officialTxIdOf;
  alice = new k.PrivateKey(KEY_A).toKeypair().toAddress("simnet").toString();
  bob = new k.PrivateKey(KEY_B).toKeypair().toAddress("simnet").toString();
});

const UTXO_AMOUNTS = [300_000_000n, 250_000_000n];
const utxoOf = (n: number) => ({
  outpoint: { transactionId: (n + 1).toString(16).padStart(64, "a"), index: n },
  address: alice,
  amountSompi: UTXO_AMOUNTS[n]!,
  scriptPublicKey: expectedScriptPublicKeyHex(alice)!,
  blockDaaScore: 0n,
  isCoinbase: false
});

/** A payment planned by the real planner (the pinned Generator: mass, fee, change) over alice's UTXOs; v0 or v1. */
async function planPayment(version: 0 | 1, extra: { computeBudget?: number; amount?: bigint } = {}) {
  const utxos = UTXO_AMOUNTS.map((_, n) => utxoOf(n));
  const amount = extra.amount ?? 100_000_000n;
  const planned = await new TxPlanService({ getUtxos: async () => utxos }).planTransactionUpstream({
    fromAddress: alice,
    toAddress: bob,
    amountSompi: amount,
    networkId: "simnet",
    ...(version === 1 ? { version: 1 } : {})
  } as any);
  const artifact: any = createTxPlanArtifact({
    ctx: systemRuntimeContext,
    networkId: asNetworkId("simnet") as any,
    mode: "localnet",
    from: { input: "alice", address: alice, accountName: "alice" },
    to: { input: "bob", address: bob },
    amountSompi: amount,
    plan: planned.plan
  } as any);
  // the upstream planner takes no compute budget: a plan that carries one (the field the signer reads) is a fixture
  if (extra.computeBudget !== undefined) artifact.computeBudget = String(extra.computeBudget);
  return artifact;
}

/** Signs `plan` with the internal signer; `onAuthorize` sees the transaction each input's authorizer is handed. */
async function sign(plan: any, onAuthorize?: (inputIndex: number, wasmTransaction: any) => void) {
  const authorizers: Record<number, any> = {};
  if (onAuthorize) {
    plan.inputs.forEach((_: unknown, i: number) => {
      const real = new PrivateKeyAuthorizer("alice", KEY_A);
      authorizers[i] = {
        authorize: (context: any) => {
          onAuthorize(context.inputIndex, context.wasmTransaction);
          return real.authorize(context);
        }
      };
    });
  }
  const signer = new KaspaWasmPrivateKeySigner({ account: { kind: "kaspa", name: "alice", network: "simnet", address: alice, privateKey: KEY_A } as any });
  return signer.signTxPlan({ planArtifact: plan, ...(onAuthorize ? { authorizers } : {}) } as any);
}

const payloadOf = (result: any) => {
  let tx: any = JSON.parse(result.signedTransaction.payload);
  while (typeof tx === "string") tx = JSON.parse(tx);
  return tx;
};

/**
 * The transaction the payload describes, rebuilt with kaspa-wasm and populated with its UTXO entries (inputs in the
 * payload's order), carrying the payload's own signature scripts, version, sig-op counts and compute budgets.
 */
function populated(payload: any, flipFirstSignatureByte = false) {
  const entries = payload.inputs.map((i: any) => {
    const u = UTXO_AMOUNTS.map((_, n) => utxoOf(n)).find((x) => x.outpoint.transactionId === i.previousOutpoint.transactionId && x.outpoint.index === Number(i.previousOutpoint.index))!;
    return { address: alice, outpoint: u.outpoint, utxoEntry: { amount: u.amountSompi, scriptPublicKey: k.payToAddressScript(alice), blockDaaScore: 0n, isCoinbase: false } };
  });
  const inTotal = entries.reduce((s: bigint, e: any) => s + e.utxoEntry.amount, 0n);
  const outputs = payload.outputs.map((o: any) => new k.PaymentOutput(k.addressFromScriptPublicKey(new k.ScriptPublicKey(Number(o.scriptPublicKey.version), o.scriptPublicKey.scriptPublicKey), "simnet"), BigInt(o.value ?? o.amount)));
  const outTotal = payload.outputs.reduce((s: bigint, o: any) => s + BigInt(o.value ?? o.amount), 0n);
  const tx = k.createTransaction(entries, outputs, inTotal - outTotal);
  tx.version = Number(payload.version);
  payload.inputs.forEach((i: any, n: number) => {
    const sig = String(i.signatureScript);
    tx.inputs[n].sequence = BigInt(i.sequence);
    tx.inputs[n].sigOpCount = Number(i.sigOpCount);
    if (i.computeBudget !== undefined) tx.inputs[n].computeBudget = Number(i.computeBudget);
    tx.inputs[n].signatureScript = flipFirstSignatureByte && n === 0 ? sig.slice(0, 10) + (sig[10] === "0" ? "1" : "0") + sig.slice(11) : sig;
  });
  if (payload.storageMass !== undefined) tx.storageMass = BigInt(payload.storageMass);
  tx.finalize();
  return tx;
}

/** kaspa-wasm's consensus verifier over the signature scripts already on `tx` (no key given: nothing is re-signed). */
function verifyEmbedded(tx: any): { ok: true } | { ok: false; error: string } {
  try {
    k.signTransaction(tx, [], true);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

describe("V1-TXID-1 · the txId the signer declares for a version-1 transaction is the id of the transaction it signed", () => {
  it("a v1 payment: the declared txId is the official id of the signed payload (it was the id of the v0 transaction as built)", async () => {
    const plan = await planPayment(1);
    expect(plan.txVersion).toBe(1);
    const result = await sign(plan);
    const payload = payloadOf(result);
    expect({ version: Number(payload.version), sigOpCounts: payload.inputs.map((i: any) => Number(i.sigOpCount)) }).toEqual({
      version: 1,
      sigOpCounts: payload.inputs.map(() => 0)
    });
    expect(result.txId).toBe(officialTxIdOf(payload));
    const v0 = await sign(await planPayment(0));
    expect(result.txId, "a v1 transaction is not the v0 one").not.toBe(v0.txId);
  });

  it("a v1 payment's signatures verify under kaspa-wasm's consensus verifier against the transaction the payload describes; that transaction's id is the declared one; a flipped byte fails", async () => {
    const result = await sign(await planPayment(1));
    const payload = payloadOf(result);
    for (const input of payload.inputs) expect(String(input.signatureScript)).toMatch(/^41[0-9a-f]{128}01$/); // push 65 · schnorr 64 · SIGHASH_ALL
    const tx = populated(payload);
    expect(tx.id).toBe(result.txId);
    expect(verifyEmbedded(tx)).toEqual({ ok: true });
    const tampered = verifyEmbedded(populated(payload, true));
    expect(tampered.ok).toBe(false);
    expect((tampered as any).error).toMatch(/IncorrectSignature/);
  });

  it("every input is signed over the finalized transaction: the transaction each authorizer is handed already has the declared id (two inputs)", async () => {
    const plan = await planPayment(1, { amount: 400_000_000n });
    expect(plan.inputs.length).toBe(2);
    const seen: Array<{ inputIndex: number; id: string; version: number }> = [];
    const result = await sign(plan, (inputIndex, wasmTransaction) => seen.push({ inputIndex, id: String(wasmTransaction.id), version: Number(wasmTransaction.version) }));
    expect(seen.length).toBe(plan.inputs.length);
    for (const s of seen) expect(s).toMatchObject({ id: result.txId, version: 1 });
    expect(result.txId).toBe(officialTxIdOf(payloadOf(result)));
  });

  it("a v1 payment with a compute budget: id official, budget on every input, signatures verify", async () => {
    const plan = await planPayment(1, { computeBudget: 7 });
    expect(plan.computeBudget).toBeDefined();
    const result = await sign(plan);
    const payload = payloadOf(result);
    expect(payload.inputs.map((i: any) => Number(i.computeBudget))).toEqual(payload.inputs.map(() => 7));
    expect(result.txId).toBe(officialTxIdOf(payload));
    expect(verifyEmbedded(populated(payload))).toEqual({ ok: true });
  });

  it("control · a v0 payment is unchanged: id official, signatures verify, sig-op count 1, sequence 0 (TX-SEQUENCE-1)", async () => {
    const result = await sign(await planPayment(0));
    const payload = payloadOf(result);
    expect(Number(payload.version)).toBe(0);
    expect(payload.inputs.map((i: any) => [Number(i.sigOpCount), String(i.sequence)])).toEqual(payload.inputs.map(() => [1, "0"]));
    expect(result.txId).toBe(officialTxIdOf(payload));
    expect(verifyEmbedded(populated(payload))).toEqual({ ok: true });
  });
});
