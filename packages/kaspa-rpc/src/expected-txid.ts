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
