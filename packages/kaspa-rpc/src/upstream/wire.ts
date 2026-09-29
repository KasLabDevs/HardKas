import { normalizeRpcStorageMass } from "../internal/storage-mass.js";
import { RpcValidationError } from "../errors.js";

/*
 * Format conversion between the official kaspa-wasm RpcClient and the node's JSON
 * wire form that HardKAS code reads and writes.
 *
 * Out of the official client: bigints, and SDK class instances (UtxoEntryReference,
 * ScriptPublicKey, Address, Hash). Into HardKAS: plain JSON data in the node's own
 * JSON shape — UTXO entries nested under `utxoEntry`, script public keys as
 * "<2-byte version><script>" hex, addresses and hashes as strings, and 64-bit
 * integers as numbers (strings above Number.MAX_SAFE_INTEGER, so no value is
 * silently rounded).
 */

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export function bigintToWire(value: bigint): number | string {
  return value <= MAX_SAFE && value >= -MAX_SAFE ? Number(value) : value.toString();
}

function isSdkObject(value: object): boolean {
  return typeof (value as { __wbg_ptr?: unknown }).__wbg_ptr === "number";
}

function sdkClassName(value: object): string | undefined {
  return (value as { constructor?: { name?: string } }).constructor?.name;
}

/** "<2-byte big-endian version><script>" hex, the node's JSON form of a script public key. */
export function scriptPublicKeyToHex(spk: unknown): string {
  if (typeof spk === "string") return spk;
  if (!spk || typeof spk !== "object") return "";
  const s = spk as { version?: unknown; script?: unknown; scriptPublicKey?: unknown };
  const version = Number(s.version ?? 0);
  return version.toString(16).padStart(4, "0") + String(s.script ?? s.scriptPublicKey ?? "");
}

function addressToString(address: unknown): string | undefined {
  if (address == null) return undefined;
  if (typeof address === "string") return address;
  if (typeof address === "object" && !isSdkObject(address)) {
    const a = address as { prefix?: unknown; payload?: unknown };
    if (typeof a.prefix === "string" && typeof a.payload === "string") return `${a.prefix}:${a.payload}`;
  }
  return String(address);
}

/**
 * A UTXO entry reference (the official client's `getUtxosByAddresses` entries and
 * `utxos-changed` payloads) in the node's JSON shape. Accepts the SDK object, its
 * plain-object form, or an entry already in the node's shape.
 */
export function utxoReferenceToWire(ref: any): Record<string, unknown> {
  const entry = ref?.entry ?? ref?.utxoEntry ?? ref;
  const outpoint = ref?.outpoint ?? entry?.outpoint ?? {};
  const covenantId = entry?.covenantId ?? ref?.covenantId;
  const address = addressToString(ref?.address ?? entry?.address);
  return {
    ...(address !== undefined ? { address } : {}),
    outpoint: { transactionId: String(outpoint.transactionId), index: Number(outpoint.index) },
    utxoEntry: {
      amount: bigintToWire(BigInt(ref?.amount ?? entry?.amount ?? 0)),
      scriptPublicKey: scriptPublicKeyToHex(ref?.scriptPublicKey ?? entry?.scriptPublicKey),
      blockDaaScore: bigintToWire(BigInt(ref?.blockDaaScore ?? entry?.blockDaaScore ?? 0)),
      isCoinbase: Boolean(ref?.isCoinbase ?? entry?.isCoinbase),
      ...(covenantId != null ? { covenantId: String(covenantId) } : {})
    }
  };
}

function sdkObjectToWire(value: object): unknown {
  switch (sdkClassName(value)) {
    case "UtxoEntryReference":
      return utxoReferenceToWire(value);
    case "ScriptPublicKey":
      return scriptPublicKeyToHex(value);
    case "Address":
    case "Hash":
      return String(value);
    default: {
      const toJSON = (value as { toJSON?: () => unknown }).toJSON;
      return typeof toJSON === "function" ? toWire(toJSON.call(value)) : String(value);
    }
  }
}

/** Official client values → plain JSON data in the node's wire shape. */
export function toWire(value: unknown): unknown {
  if (typeof value === "bigint") return bigintToWire(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(toWire);
  if (isSdkObject(value)) return sdkObjectToWire(value);
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) out[key] = toWire(v);
  return out;
}

// Fields the official client takes as bigint (u64 on the node).
const U64_FIELDS = new Set(["timestamp", "nonce", "daaScore", "blueScore", "value", "amount", "lockTime", "gas", "sequence", "storageMass", "mass", "blockDaaScore"]);

/** The inverse of `toWire` for the u64 fields of a block, so a template read through HardKAS can be submitted back. */
export function u64FieldsToBigint(value: unknown, key?: string): unknown {
  if (key !== undefined && U64_FIELDS.has(key)) {
    if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
    if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  }
  if (value === null || typeof value !== "object" || isSdkObject(value)) return value;
  if (Array.isArray(value)) return value.map((v) => u64FieldsToBigint(v));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = u64FieldsToBigint(v, k);
  return out;
}

function unwrapTransaction(input: unknown): unknown {
  let tx: any = input;
  while (typeof tx === "string" && tx.trim().startsWith("{")) {
    const parsed = JSON.parse(tx);
    tx = parsed && typeof parsed === "object" ? (parsed.tx ?? parsed.inner ?? parsed) : parsed;
  }
  while (tx && typeof tx === "object" && !Array.isArray(tx) && !isSdkObject(tx) && ("tx" in tx || "inner" in tx)) {
    tx = tx.tx ?? tx.inner;
  }
  return tx;
}

/**
 * A HardKAS transaction (its broadcast payload: the node's JSON, a JSON string of it,
 * or either wrapped in `tx`/`inner`) as the official client's `ITransaction`.
 * The storage mass commitment is checked exactly as before (`normalizeRpcStorageMass`):
 * a missing or conflicting commitment is refused before anything is sent.
 */
export function toOfficialTransaction(input: unknown): unknown {
  const tx: any = unwrapTransaction(input);
  if (!tx || typeof tx !== "object" || Array.isArray(tx)) {
    throw new RpcValidationError("submitTransaction: expected a transaction object or its JSON", "RPC_TRANSACTION_INVALID");
  }
  if (isSdkObject(tx)) return tx;

  const mass: Record<string, unknown> = {};
  for (const k of ["storageMass", "storage_mass", "mass"]) if (tx[k] !== undefined) mass[k] = tx[k];
  normalizeRpcStorageMass(mass);

  const version = Number(tx.version ?? 0);
  return {
    version,
    inputs: (tx.inputs ?? []).map((i: any) => {
      const po = i.previousOutpoint ?? i.previous_outpoint ?? {};
      const computeBudget = i.computeBudget ?? i.compute_budget;
      return {
        previousOutpoint: { transactionId: String(po.transactionId ?? po.transaction_id), index: Number(po.index) },
        signatureScript: String(i.signatureScript ?? i.signature_script ?? ""),
        sequence: BigInt(i.sequence ?? 0),
        // v1 inputs commit a compute budget and declare 0 sig ops (SigopCountInV1).
        sigOpCount: Number(i.sigOpCount ?? i.sig_op_count ?? (version >= 1 ? 0 : 1)),
        ...(computeBudget !== undefined ? { computeBudget: Number(computeBudget) } : {})
      };
    }),
    outputs: (tx.outputs ?? []).map((o: any) => {
      const covenant = o.covenant;
      return {
        value: BigInt(o.value ?? o.amount),
        scriptPublicKey: scriptPublicKeyToHex(o.scriptPublicKey ?? o.script_public_key),
        ...(covenant
          ? {
              covenant: {
                authorizingInput: Number(covenant.authorizingInput ?? covenant.authorizing_input),
                covenantId: String(covenant.covenantId ?? covenant.covenant_id)
              }
            }
          : {})
      };
    }),
    lockTime: BigInt(tx.lockTime ?? tx.lock_time ?? 0),
    subnetworkId: String(tx.subnetworkId ?? tx.subnetwork_id ?? "0000000000000000000000000000000000000000"),
    gas: BigInt(tx.gas ?? 0),
    payload: String(tx.payload ?? ""),
    storageMass: BigInt(mass.storageMass as number)
  };
}
