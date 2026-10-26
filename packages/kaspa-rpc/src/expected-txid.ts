import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { RpcValidationError, knownTxIdOf, markRequestNotSent } from "./errors.js";
import { toOfficialTransaction } from "./upstream/wire.js";

// EXPECTED-TXID-1: a signed transaction usually reaches a client as the signer's JSON text, which carries no id. The
// caller hands the signed artifact's TXID in (`SubmitTransactionOptions.expectedTxId`); the client checks it against the
// transaction it is about to send — the id the official kaspa-wasm computes for it — and names it in every outcome
// (accepted only when the node's answer names it; otherwise unknown, keeping it). No HardKAS hashing: kaspa-wasm's own
// `Transaction.id` (it excludes signature scripts), over the same conversion the clients send.

const HEX64 = /^[0-9a-f]{64}$/i;

/**
 * The id the official kaspa-wasm gives `transaction` (the signer's JSON text, an RPC-transaction object, or a kaspa-wasm
 * Transaction), after the same conversion the clients apply before sending. Throws when it cannot be computed.
 */
export function officialTxIdOf(transaction: unknown): string {
  const official: any = toOfficialTransaction(transaction);
  const sdkObject = official && typeof official === "object" && typeof official.serializeToObject === "function";
  const id = String(sdkObject ? official.id : new (loadManagedKaspaWasmSync() as any).Transaction(official).id);
  if (!HEX64.test(id)) throw new Error("kaspa-wasm returned no transaction id");
  return id.toLowerCase();
}

/**
 * PAYMENT-PREFLIGHT-1: the transaction exactly as a HardKAS client sends it (the conversion `officialTxIdOf` and the clients
 * apply), built by the official kaspa-wasm with the UTXO entry each input spends supplied by the caller (`utxos[n]` for
 * input n: its amount and its script public key as "<2-byte version><script>" hex), as kaspa-wasm serializes it
 * (`serializeToObject()`), and its official id, which the entries do not change: what a check of its signatures reads.
 * Throws when it cannot be built; a kaspa-wasm Transaction is not accepted (its inputs' entries could not be replaced).
 */
export function officialTransactionWithUtxos(
  transaction: unknown,
  utxos: ReadonlyArray<{ readonly amount: bigint; readonly scriptPublicKey: string }>
): { id: string; serialized: any } {
  const official: any = toOfficialTransaction(transaction);
  if (typeof official?.serializeToObject === "function") throw new Error("expected the transaction's JSON, not a kaspa-wasm Transaction");
  const inputs: any[] = official.inputs;
  if (utxos.length !== inputs.length) throw new Error(`${utxos.length} UTXO entries for ${inputs.length} inputs`);
  const k: any = loadManagedKaspaWasmSync();
  const tx = new k.Transaction({
    ...official,
    inputs: inputs.map((i, n) => {
      const spk = String(utxos[n]!.scriptPublicKey);
      if (!/^(?:[0-9a-f]{2}){2,}$/i.test(spk)) throw new Error(`the UTXO entry of input ${n} has no serialized script public key`);
      const scriptPublicKey = new k.ScriptPublicKey(parseInt(spk.slice(0, 4), 16), spk.slice(4));
      return { ...i, utxo: { outpoint: i.previousOutpoint, amount: utxos[n]!.amount, scriptPublicKey, blockDaaScore: 0n, isCoinbase: false } };
    })
  });
  const id = String(tx.id);
  if (!HEX64.test(id)) throw new Error("kaspa-wasm returned no transaction id");
  return { id: id.toLowerCase(), serialized: tx.serializeToObject() };
}

/**
 * The TXID a submission is made under. Without `expectedTxId`: the id the transaction carries, if any (unchanged
 * behaviour). With it: it must be a 64-hex id, equal to any id the transaction carries and to the official id of the
 * transaction — otherwise the submission is refused before anything is sent (typed not-sent; RpcValidationError
 * RPC_EXPECTED_TXID_INVALID / RPC_EXPECTED_TXID_MISMATCH / RPC_EXPECTED_TXID_UNVERIFIABLE).
 */
export function submitTxIdOf(transaction: unknown, options?: { expectedTxId?: unknown } | undefined): string | undefined {
  const carried = knownTxIdOf(transaction);
  const declared = options?.expectedTxId;
  if (declared === undefined) return carried;
  const refuse = (code: string, why: string) =>
    markRequestNotSent(new RpcValidationError(`submitTransaction was not sent (before the transport): ${why}`, code));
  if (typeof declared !== "string" || !HEX64.test(declared)) {
    throw refuse("RPC_EXPECTED_TXID_INVALID", "expectedTxId must be a 64-hex transaction id");
  }
  const expected = declared.toLowerCase();
  if (carried !== undefined && carried !== expected) {
    throw refuse("RPC_EXPECTED_TXID_MISMATCH", `the transaction carries id ${carried}, not the expected ${expected}`);
  }
  let official: string;
  try {
    official = officialTxIdOf(transaction);
  } catch (e) {
    throw refuse("RPC_EXPECTED_TXID_UNVERIFIABLE", `the official id of the transaction cannot be computed (${e instanceof Error ? e.message : String(e)})`);
  }
  if (official !== expected) {
    throw refuse("RPC_EXPECTED_TXID_MISMATCH", `the transaction's official id is ${official}, not the expected ${expected}`);
  }
  return expected;
}
