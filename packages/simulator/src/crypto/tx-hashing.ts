import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { KaspaHasher, bytesToHex } from "./kaspa-sighash.js";
import type { KaspaRpcTransaction } from "../types.js";

/*
 * Transaction hashing as rusty-kaspa consensus/core/src/hashing/tx.rs does it (SIM-04, audit 6-nov-2026):
 *  - v0 id (`id_v0`): blake2b keyed "TransactionID" over the transaction without signature scripts (non-coinbase) and
 *    without the mass, computed here; it does not depend on kaspa-wasm being installed (checked against kaspa-wasm in
 *    test/differential-wasm.test.ts).
 *  - v1 id (`id_v1`, payload digest + the rest without payload, signatures or mass): computed only by the managed
 *    kaspa-wasm. Without it the id is refused (SIMULATOR_TXID_V1_UNAVAILABLE), never replaced by the v0 hasher, which gave
 *    v1 transactions an id the node would not.
 *  - hash(): blake2b keyed "TransactionHash" over the full transaction.
 */

export const COINBASE_SUBNETWORK_ID = "01" + "00".repeat(19);
export const NATIVE_SUBNETWORK_ID = "00".repeat(20);

function txidError(code: string, message: string, cause?: unknown): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  if (cause !== undefined) (err as any).cause = cause;
  return err;
}

// The managed kaspa-wasm, loaded once; a load failure is kept (and reported) instead of being retried on every id.
let wasmState: { k: any } | { error: unknown } | undefined;
function managedWasm(): any {
  if (!wasmState) {
    try {
      wasmState = { k: loadManagedKaspaWasmSync() };
    } catch (error) {
      wasmState = { error };
    }
  }
  if ("k" in wasmState) return wasmState.k;
  const cause: any = wasmState.error;
  throw txidError(
    "SIMULATOR_TXID_V1_UNAVAILABLE",
    `a v1 transaction id needs the managed kaspa-wasm (hardkas toolchain install kaspa-wasm): ${cause?.code ?? cause?.message ?? cause}`,
    cause
  );
}

function idV1FromWasm(tx: KaspaRpcTransaction, k: any): string {
  try {
    const inputs = (tx.inputs || []).map((inp: any) => {
      const txid = String(inp.previousOutpoint?.transactionId || "").replace(/^0x/, "");
      const index = Number(inp.previousOutpoint?.index ?? 0);
      const po = new k.TransactionOutpoint(new k.Hash(txid), index);
      const sigScript = typeof inp.signatureScript === "string"
        ? Buffer.from(inp.signatureScript.replace(/^0x/, ""), "hex")
        : (inp.signatureScript ?? new Uint8Array(0));
      const i = new k.TransactionInput({
        previousOutpoint: po,
        signatureScript: sigScript,
        sequence: BigInt(inp.sequence ?? 0),
        sigOpCount: Number(inp.sigOpCount ?? 0)
      });
      if (inp.computeBudget !== undefined) {
        i.computeBudget = Number(inp.computeBudget);
      }
      return i;
    });

    const outputs = (tx.outputs || []).map((out: any) => {
      const spk = out.scriptPublicKey;
      const script = typeof spk === "string" ? spk : (spk?.scriptPublicKey ?? spk?.script ?? "");
      const ver = typeof spk === "object" ? Number(spk?.version ?? 0) : 0;
      const wasmOut = new k.TransactionOutput(
        BigInt(out.amount ?? out.value ?? 0),
        new k.ScriptPublicKey(ver, script.replace(/^0x/, ""))
      );
      if (out.covenant) {
        // a malformed binding is an error, never an output silently left without its covenant
        wasmOut.covenant = new k.CovenantBinding(
          Number(out.covenant.authorizingInput ?? 0),
          new k.Hash(String(out.covenant.covenantId).replace(/^0x/, ""))
        );
      }
      return wasmOut;
    });

    const wasmTx = new k.Transaction({
      version: Number(tx.version ?? 0),
      inputs,
      outputs,
      lockTime: BigInt(tx.lockTime ?? 0),
      subnetworkId: String(tx.subnetworkId || NATIVE_SUBNETWORK_ID).replace(/^0x/, ""),
      gas: BigInt(tx.gas ?? 0),
      payload: typeof tx.payload === "string"
        ? Buffer.from(tx.payload.replace(/^0x/, ""), "hex")
        : (tx.payload ?? new Uint8Array(0)),
      mass: BigInt(tx.mass ?? 0)
    });
    wasmTx.finalize();
    return String(wasmTx.id).toLowerCase();
  } catch (e: any) {
    throw txidError("SIMULATOR_TXID_INVALID_TRANSACTION", `kaspa-wasm cannot compute the id of this v1 transaction: ${e?.message ?? e}`, e);
  }
}

function hex(s: string): Uint8Array {
  const clean = (s ?? "").replace(/^0x/, "");
  if (!/^(?:[0-9a-f]{2})*$/i.test(clean)) throw new Error(`TX_HASH_INPUT_INVALID: not hex: ${s}`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

/** A script public key as transmitted: either bare script hex, or "vvvv"+script (kaspa-wasm form). */
export function splitScriptPublicKey(spk: { version?: number; scriptPublicKey: string }): { version: number; script: string } {
  return { version: Number(spk.version ?? 0), script: spk.scriptPublicKey.toLowerCase() };
}

export function isCoinbaseTx(tx: KaspaRpcTransaction): boolean {
  return String(tx.subnetworkId ?? "").toLowerCase() === COINBASE_SUBNETWORK_ID;
}

function writeTransaction(h: KaspaHasher, tx: KaspaRpcTransaction, includeSignatureScripts: boolean, includeMass: boolean): void {
  h.u16(Number(tx.version ?? 0)).u64(BigInt(tx.inputs.length));
  for (const i of tx.inputs) {
    h.bytes(hex(i.previousOutpoint.transactionId)).u32(Number(i.previousOutpoint.index));
    if (includeSignatureScripts) {
      h.varBytes(hex(i.signatureScript ?? "")).u8(Number(i.sigOpCount ?? 0));
    } else {
      h.varBytes(new Uint8Array(0));
    }
    h.u64(BigInt(i.sequence ?? 0));
  }
  h.u64(BigInt(tx.outputs.length));
  for (const o of tx.outputs) {
    const spk = splitScriptPublicKey(o.scriptPublicKey);
    h.u64(BigInt(o.amount)).u16(spk.version).varBytes(hex(spk.script));
  }
  h.u64(BigInt(tx.lockTime ?? 0))
    .bytes(hex(tx.subnetworkId || NATIVE_SUBNETWORK_ID))
    .u64(BigInt(tx.gas ?? 0))
    .varBytes(hex(tx.payload ?? ""));
  if (includeMass) {
    const mass = BigInt(tx.mass ?? 0);
    if (mass > 0n) h.u64(mass);
  }
}

/** The v0 consensus id (`id_v0`), computed locally. */
export function transactionIdV0(tx: KaspaRpcTransaction): string {
  if (Number(tx.version ?? 0) !== 0) {
    throw txidError("SIMULATOR_TXID_VERSION_MISMATCH", `transactionIdV0 called on a version ${tx.version} transaction`);
  }
  const h = new KaspaHasher("TransactionID");
  writeTransaction(h, tx, isCoinbaseTx(tx), false);
  return bytesToHex(h.digest());
}

/**
 * The consensus transaction id: v0 computed here, v1 (and later) by the managed kaspa-wasm. Throws
 * SIMULATOR_TXID_V1_UNAVAILABLE (no kaspa-wasm) or SIMULATOR_TXID_INVALID_TRANSACTION; never falls back.
 */
export function transactionId(tx: KaspaRpcTransaction): string {
  if (Number(tx.version ?? 0) === 0) return transactionIdV0(tx);
  return idV1FromWasm(tx, managedWasm());
}

/** The full transaction hash (includes signature scripts and the committed mass). */
export function transactionHash(tx: KaspaRpcTransaction): string {
  const h = new KaspaHasher("TransactionHash");
  writeTransaction(h, tx, true, true);
  return bytesToHex(h.digest());
}

/** Test seam: forget the cached kaspa-wasm load result. */
export function resetManagedWasmCacheForTests(): void {
  wasmState = undefined;
}
