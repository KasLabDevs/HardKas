import { loadManagedKaspaWasmSync } from "./kaspa-wasm.js";
import {
  getSilContract,
  type SilAbiArtifact,
  type SilArtifactValue,
  type SilNamedType,
  type SilTypeArtifact
} from "./silverscript.js";
import { silArrayPayload, silStructsOf, type SilStructs } from "./silverscript-state.js";

/**
 * Locking and unlocking SilverScript contracts, with the pinned Kaspa SDK as
 * the only script authority.
 *
 * The lock is the SDK's pay-to-script-hash of the contract bytecode. The unlock
 * follows silverscript-abi `encode_contract_entry_sig_script`: each argument
 * pushed in order, then the entry's dispatch tag, then the redeem script
 * (`payToScriptHashSignatureScript`). Scalars are one SDK push each. Arrays and
 * structs follow silverscript-abi v1.0.0 `push_sig_arg` (F1 phase 2 · KCC-1): a
 * struct pushes its fields in order; an array of scalars is one push of its
 * items' fixed-width bytes; an array of structs is pushed column by column, one
 * array per struct field (`push_struct_array_fields`).
 */

function abiError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

const HEX = /^(?:[0-9a-fA-F]{2})*$/;

function toHex(bytes: Uint8Array | readonly number[]): string {
  return Buffer.from(bytes as ArrayLike<number> as Uint8Array).toString("hex");
}

function spkObject(spk: any): { version: number; script: string } {
  const o = typeof spk?.serializeToObject === "function" ? spk.serializeToObject() : spk;
  return { version: Number(o.version), script: String(o.script) };
}

/** The P2SH locking script of a contract's bytecode, from the SDK. */
export function silverP2shLock(bytecodeHex: string): { version: number; script: string } {
  if (!HEX.test(bytecodeHex) || bytecodeHex.length === 0) throw abiError("SILVER_ABI_ARGUMENT_INVALID", "bytecode is not hex");
  const k = loadManagedKaspaWasmSync();
  return spkObject(k.payToScriptHashScript(bytecodeHex));
}

/** The P2SH address of a contract's bytecode on a network ("simnet", "testnet-10", "mainnet"), from the SDK. */
export function silverP2shAddress(bytecodeHex: string, network: string): string {
  const k = loadManagedKaspaWasmSync();
  const lock = silverP2shLock(bytecodeHex);
  return k.addressFromScriptPublicKey(new k.ScriptPublicKey(lock.version, lock.script), network).toString();
}

function mismatch(where: string, expected: string, value: SilArtifactValue): never {
  throw abiError("SILVER_ABI_ARGUMENT_INVALID", `${where}: expected ${expected}, got ${(value as any)?.kind ?? typeof value}`);
}

const I64_MIN = -(2n ** 63n);
const I64_MAX = 2n ** 63n - 1n;

function fixedBytes(where: string, value: SilArtifactValue, len: number): string {
  if (value?.kind !== "bytes") mismatch(where, `${len} bytes`, value);
  const bytes = Array.from(value.value as ArrayLike<number>);
  if (bytes.length !== len || !bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
    throw abiError("SILVER_ABI_ARGUMENT_INVALID", `${where}: expected ${len} bytes, got ${bytes.length}`);
  }
  return toHex(bytes);
}

function structFields(structs: SilStructs, where: string, name: string): readonly SilNamedType[] {
  const fields = structs.byName(name);
  if (!fields) throw abiError("SILVER_ABI_ARGUMENT_INVALID", `${where}: unknown struct '${name}'`);
  return fields;
}

function objectFields(where: string, value: SilArtifactValue, fields: readonly SilNamedType[]): Readonly<Record<string, SilArtifactValue>> {
  if (value?.kind !== "object") mismatch(where, "struct", value);
  const extra = Object.keys(value.value).filter((k) => !fields.some((f) => f.name === k));
  if (extra.length > 0) throw abiError("SILVER_ABI_ARGUMENT_INVALID", `${where}: unknown field(s) ${extra.join(", ")}`);
  for (const f of fields) if (!(f.name in value.value)) throw abiError("SILVER_ABI_ARGUMENT_INVALID", `${where}: missing field '${f.name}'`);
  return value.value;
}

/** silverscript-abi `push_struct_array_fields`: one array per struct field, in field order. */
function pushStructArray(sb: any, structs: SilStructs, where: string, item: { kind: "struct"; name: string }, len: number | undefined, value: SilArtifactValue): void {
  const fields = structFields(structs, where, item.name);
  if (value?.kind !== "array") mismatch(where, "array of structs", value);
  if (len !== undefined && value.value.length !== len) throw abiError("SILVER_ABI_ARGUMENT_INVALID", `${where}: expected ${len} items, got ${value.value.length}`);
  const objects = value.value.map((v, i) => objectFields(`${where}[${i}]`, v, fields));
  for (const f of fields) {
    pushArgument(sb, structs, `${where}.${f.name}`, { kind: "dynamic_array", item: f.type }, { kind: "array", value: objects.map((o) => o[f.name]!) });
  }
}

/** One argument, pushed exactly as silverscript-abi `push_sig_arg` does. */
function pushArgument(sb: any, structs: SilStructs, where: string, type: SilTypeArtifact, value: SilArtifactValue): void {
  switch (type.kind) {
    case "int":
    case "temporal": {
      if (value?.kind !== "int") mismatch(where, "int", value);
      if (typeof value.value === "number" && !Number.isSafeInteger(value.value)) {
        throw abiError("SILVER_ABI_ARGUMENT_INVALID", `${where}: ${value.value} is not an exact integer`);
      }
      const n = BigInt(value.value);
      // Upstream rejects i64::MIN (it has no minimal script-number encoding).
      if (n <= I64_MIN || n > I64_MAX) throw abiError("SILVER_ABI_ARGUMENT_INVALID", `${where}: ${n} is outside the script number range`);
      sb.addI64(n);
      return;
    }
    case "bool":
      if (value?.kind !== "bool") mismatch(where, "bool", value);
      sb.addI64(value.value ? 1n : 0n);
      return;
    case "byte":
      if (value?.kind !== "byte") mismatch(where, "byte", value);
      if (!Number.isInteger(value.value) || value.value < 0 || value.value > 255) {
        throw abiError("SILVER_ABI_ARGUMENT_INVALID", `${where}: byte out of range`);
      }
      sb.addData(toHex([value.value]));
      return;
    case "bytes":
      if (value?.kind !== "bytes") mismatch(where, "bytes", value);
      sb.addData(toHex(Array.from(value.value as ArrayLike<number>)));
      return;
    case "string":
      if (value?.kind !== "text") mismatch(where, "text", value);
      sb.addData(Buffer.from(value.value, "utf8").toString("hex"));
      return;
    case "pubkey":
      sb.addData(fixedBytes(where, value, 32));
      return;
    case "sig":
      sb.addData(fixedBytes(where, value, 65));
      return;
    case "datasig":
      sb.addData(fixedBytes(where, value, 64));
      return;
    case "fixed_bytes":
      sb.addData(fixedBytes(where, value, type.len));
      return;
    case "struct": {
      const fields = structFields(structs, where, type.name);
      const object = objectFields(where, value, fields);
      for (const f of fields) pushArgument(sb, structs, `${where}.${f.name}`, f.type, object[f.name]!);
      return;
    }
    case "fixed_array":
    case "dynamic_array": {
      const len = type.kind === "fixed_array" ? type.len : undefined;
      if (type.item.kind === "struct") return pushStructArray(sb, structs, where, type.item, len, value);
      let payload: Uint8Array;
      try {
        payload = silArrayPayload(where, type.item, len, value);
      } catch (e: any) {
        throw abiError(e?.code === "SILVER_ABI_NOT_IMPLEMENTED" ? "SILVER_ABI_NOT_IMPLEMENTED" : "SILVER_ABI_ARGUMENT_INVALID", String(e?.message ?? e).replace(/^[A-Z_]+:\s*/, ""));
      }
      sb.addData(toHex(payload));
      return;
    }
    default:
      throw abiError("SILVER_ABI_NOT_IMPLEMENTED", `${where}: unknown type kind '${(type as any).kind}'`);
  }
}

export interface SilverEntryCall {
  readonly artifact: SilAbiArtifact;
  /** Needed only when the artifact holds more than one contract. */
  readonly contractName?: string | undefined;
  readonly entry: string;
  readonly args: readonly SilArtifactValue[];
}

/**
 * The entry-invocation part of the signature script: the arguments, then the
 * dispatch tag (silverscript-abi `encode_contract_entry_sig_script`). The
 * redeem script is appended by {@link silverUnlockScript}.
 */
export function encodeSilverEntryArgs(call: SilverEntryCall): string {
  const { name: contractName, contract } = getSilContract(call.artifact, call.contractName);
  const entry = contract.entries[call.entry];
  if (!entry) {
    throw abiError(
      "SILVER_ABI_UNKNOWN_ENTRY",
      `contract '${contractName}' has no entry '${call.entry}' (has: ${Object.keys(contract.entries).join(", ")})`
    );
  }
  if (entry.params.length !== call.args.length) {
    throw abiError(
      "SILVER_ABI_ARGUMENT_INVALID",
      `${contractName}::${call.entry} takes ${entry.params.length} arguments, got ${call.args.length}`
    );
  }
  const k = loadManagedKaspaWasmSync();
  const sb = new k.ScriptBuilder();
  const structs = silStructsOf(call.artifact, contract);
  entry.params.forEach((param, i) => pushArgument(sb, structs, `${contractName}::${call.entry}(${param.name})`, param.type, call.args[i]!));
  sb.addData(entry.dispatch_tag);
  return String(sb.drain());
}

/** The full P2SH signature script: entry arguments followed by the pushed redeem script. */
export function silverUnlockScript(bytecodeHex: string, entryArgsHex: string): string {
  if (!HEX.test(entryArgsHex)) throw abiError("SILVER_ABI_ARGUMENT_INVALID", "entry arguments are not hex");
  const k = loadManagedKaspaWasmSync();
  return String(k.payToScriptHashSignatureScript(bytecodeHex, entryArgsHex));
}

/**
 * The 65-byte `sig` value (Schnorr signature + sighash type) inside an SDK
 * `createInputSignature` result, which upstream returns as the P2PK signature
 * script `OP_DATA_65 <sig+sighash>`.
 */
export function silverSigFromInputSignature(inputSignatureHex: string): Uint8Array {
  const bytes = Buffer.from(inputSignatureHex, "hex");
  if (!HEX.test(inputSignatureHex) || bytes.length !== 66 || bytes[0] !== 0x41) {
    throw abiError(
      "SILVER_ABI_SIGNATURE_INVALID",
      `expected OP_DATA_65 followed by 65 bytes, got ${bytes.length} bytes starting with ${bytes[0]?.toString(16) ?? "nothing"}`
    );
  }
  return new Uint8Array(bytes.subarray(1));
}
