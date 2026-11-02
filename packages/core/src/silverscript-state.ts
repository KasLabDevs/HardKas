import { blake3 } from "@noble/hashes/blake3.js";
import { loadManagedKaspaWasmSync } from "./kaspa-wasm.js";
import {
  getSilContract,
  silContractBytecodeHex,
  type SilAbiArtifact,
  type SilArtifactValue,
  type SilContractArtifact,
  type SilNamedType,
  type SilTypeArtifact
} from "./silverscript.js";

/**
 * The runtime state of a SilverScript contract and its template, as silverscript-abi v1.0.0 encodes them
 * (`encode_runtime_state_script`, `decode_runtime_state_script`, `template_hash`; KCC-1).
 *
 * A covenant's state lives in its bytecode, between a template prefix and suffix (`compiled.state_span`). Its encoding is
 * fixed by the ABI: every leaf of every State field (struct fields flattened; arrays of structs column by column) is one
 * push with an explicit push-data opcode, its payload the field's fixed-width bytes (int: 8-byte script number). The
 * template hash is blake3(len(prefix) ‖ prefix ‖ len(suffix) ‖ suffix), each length an 8-byte script number, so every
 * state of one contract shares it. With these, the successor of a covenant is its prefix, the new state's encoding and its
 * suffix: no recompilation, any state the ABI encodes (derived fields, arrays, structs). The node still decides whether a
 * transition is valid: this only says which script carries which state.
 */

function stateError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

const I64_MIN = -(2n ** 63n);
const I64_MAX = 2n ** 63n - 1n;
const hex = (b: Uint8Array | readonly number[]) => Buffer.from(b as ArrayLike<number> as Uint8Array).toString("hex");
const unhex = (h: string) => new Uint8Array(Buffer.from(h, "hex"));

/** kaspa-txscript `serialize_i64(value, size)`: little-endian magnitude, sign in the top bit of the last byte. */
export function silScriptNumber(value: bigint, size?: number): Uint8Array {
  if (value < I64_MIN || value > I64_MAX) throw stateError("SILVER_ABI_ARGUMENT_INVALID", `${value} is outside i64`);
  const negative = value < 0n;
  let magnitude = negative ? -value : value;
  const out: number[] = [];
  let lastSaturated = false;
  while (magnitude > 0n) {
    const byte = Number(magnitude & 0xffn);
    lastSaturated = (byte & 0x80) !== 0;
    out.push(byte);
    magnitude >>= 8n;
  }
  if (lastSaturated) out.push(0);
  if (size !== undefined) {
    if (out.length > size) throw stateError("SILVER_ABI_ARGUMENT_INVALID", `${value} needs more than ${size} bytes`);
    while (out.length < size) out.push(0);
  }
  if (negative) out[out.length - 1]! |= 0x80;
  return Uint8Array.from(out);
}

/** kaspa-txscript `deserialize_i64` (at most 8 bytes; not required to be minimal). */
export function silScriptNumberValue(bytes: Uint8Array): bigint {
  if (bytes.length > 8) throw stateError("SILVER_STATE_INVALID", `a number of ${bytes.length} bytes is longer than 8`);
  if (bytes.length === 0) return 0n;
  const msb = bytes[bytes.length - 1]!;
  let acc = BigInt(msb & 0x7f);
  for (let i = bytes.length - 2; i >= 0; i--) acc = (acc << 8n) + BigInt(bytes[i]!);
  return msb & 0x80 ? -acc : acc;
}

/** The structs an ABI value can name: the artifact's, and `State` for a contract's runtime state (sig-script args). */
export interface SilStructs {
  readonly byName: (name: string) => readonly SilNamedType[] | undefined;
}

export function silStructsOf(artifact: SilAbiArtifact, contract?: SilContractArtifact): SilStructs {
  return {
    byName: (name) => (name === "State" && contract ? contract.runtime_state.fields : artifact.structs[name]?.fields)
  };
}

function bytesOf(where: string, value: SilArtifactValue, len?: number): Uint8Array {
  if (value?.kind !== "bytes") throw stateError("SILVER_ABI_ARGUMENT_INVALID", `${where}: expected bytes, got ${(value as any)?.kind}`);
  const b = Array.from(value.value as ArrayLike<number>);
  if (!b.every((x) => Number.isInteger(x) && x >= 0 && x <= 255)) throw stateError("SILVER_ABI_ARGUMENT_INVALID", `${where}: not a byte array`);
  if (len !== undefined && b.length !== len) throw stateError("SILVER_ABI_ARGUMENT_INVALID", `${where}: expected ${len} bytes, got ${b.length}`);
  return Uint8Array.from(b);
}

function intOf(where: string, value: SilArtifactValue): bigint {
  if (value?.kind !== "int") throw stateError("SILVER_ABI_ARGUMENT_INVALID", `${where}: expected int, got ${(value as any)?.kind}`);
  if (typeof value.value === "number" && !Number.isSafeInteger(value.value)) throw stateError("SILVER_ABI_ARGUMENT_INVALID", `${where}: ${value.value} is not an exact integer`);
  return BigInt(value.value);
}

function arrayOf(where: string, value: SilArtifactValue, len?: number): readonly SilArtifactValue[] {
  if (value?.kind !== "array") throw stateError("SILVER_ABI_ARGUMENT_INVALID", `${where}: expected an array, got ${(value as any)?.kind}`);
  if (len !== undefined && value.value.length !== len) throw stateError("SILVER_ABI_ARGUMENT_INVALID", `${where}: expected ${len} items, got ${value.value.length}`);
  return value.value;
}

function objectOf(where: string, value: SilArtifactValue, fields: readonly SilNamedType[]): Readonly<Record<string, SilArtifactValue>> {
  if (value?.kind !== "object") throw stateError("SILVER_ABI_ARGUMENT_INVALID", `${where}: expected a struct, got ${(value as any)?.kind}`);
  const extra = Object.keys(value.value).filter((k) => !fields.some((f) => f.name === k));
  if (extra.length > 0) throw stateError("SILVER_ABI_ARGUMENT_INVALID", `${where}: unknown field(s) ${extra.join(", ")}`);
  for (const f of fields) if (!(f.name in value.value)) throw stateError("SILVER_ABI_ARGUMENT_INVALID", `${where}: missing field '${f.name}'`);
  return value.value;
}

/** silverscript-abi `encode_fixed_payload`: the fixed-width bytes of one value. */
export function silFixedPayload(where: string, type: SilTypeArtifact, value: SilArtifactValue): Uint8Array {
  switch (type.kind) {
    case "int":
    case "temporal":
      return silScriptNumber(intOf(where, value), 8);
    case "bool":
      if (value?.kind !== "bool") throw stateError("SILVER_ABI_ARGUMENT_INVALID", `${where}: expected bool`);
      return Uint8Array.of(value.value ? 1 : 0);
    case "byte":
      if (value?.kind !== "byte" || !Number.isInteger(value.value) || value.value < 0 || value.value > 255) throw stateError("SILVER_ABI_ARGUMENT_INVALID", `${where}: expected byte`);
      return Uint8Array.of(value.value);
    case "pubkey":
      return bytesOf(where, value, 32);
    case "sig":
      return bytesOf(where, value, 65);
    case "datasig":
      return bytesOf(where, value, 64);
    case "fixed_bytes":
      return bytesOf(where, value, type.len);
    case "fixed_array":
      return silArrayPayload(where, type.item, type.len, value);
    default:
      throw stateError("SILVER_ABI_NOT_IMPLEMENTED", `${where}: ${type.kind} has no fixed-width encoding`);
  }
}

/** silverscript-abi `encode_array_payload`: the items' fixed-width bytes, concatenated (arrays of scalars only). */
export function silArrayPayload(where: string, item: SilTypeArtifact, len: number | undefined, value: SilArtifactValue): Uint8Array {
  if (item.kind === "struct") throw stateError("SILVER_ABI_NOT_IMPLEMENTED", `${where}: an array of structs has no single payload`);
  const parts = arrayOf(where, value, len).map((v, i) => silFixedPayload(`${where}[${i}]`, item, v));
  return Uint8Array.from(parts.flatMap((p) => Array.from(p)));
}

/** silverscript-abi `fixed_payload_len`. */
function fixedPayloadLen(type: SilTypeArtifact): number | undefined {
  switch (type.kind) {
    case "int":
    case "temporal":
      return 8;
    case "bool":
    case "byte":
      return 1;
    case "pubkey":
      return 32;
    case "sig":
      return 65;
    case "datasig":
      return 64;
    case "fixed_bytes":
      return type.len;
    case "fixed_array": {
      const item = fixedPayloadLen(type.item);
      return item === undefined ? undefined : item * type.len;
    }
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// State flattening (silverscript-abi flatten_struct_types / flatten_sruct_value): struct names refer to artifact.structs
// ---------------------------------------------------------------------------

const sameType = (a: SilTypeArtifact, b: SilTypeArtifact) => JSON.stringify(a) === JSON.stringify(b);
const arrayType = (item: SilTypeArtifact, len: number | undefined): SilTypeArtifact => (len === undefined ? { kind: "dynamic_array", item } : { kind: "fixed_array", item, len });

function flattenTypes(artifact: SilAbiArtifact, type: SilTypeArtifact, visiting: Set<string> = new Set()): SilTypeArtifact[] {
  switch (type.kind) {
    case "struct": {
      if (visiting.has(type.name)) throw stateError("SILVER_STATE_INVALID", `cyclic struct ${type.name}`);
      const s = artifact.structs[type.name];
      if (!s) throw stateError("SILVER_STATE_INVALID", `unknown struct ${type.name}`);
      visiting.add(type.name);
      const leaves = s.fields.flatMap((f) => flattenTypes(artifact, f.type, visiting));
      visiting.delete(type.name);
      return leaves;
    }
    case "fixed_array":
    case "dynamic_array": {
      const len = type.kind === "fixed_array" ? type.len : undefined;
      const leaves = flattenTypes(artifact, type.item, visiting);
      if (leaves.length === 1 && sameType(leaves[0]!, type.item)) return [type];
      return leaves.map((leaf) => arrayType(leaf, len));
    }
    default:
      return [type];
  }
}

function flattenValue(artifact: SilAbiArtifact, where: string, type: SilTypeArtifact, value: SilArtifactValue, visiting: Set<string> = new Set()): Array<[SilTypeArtifact, SilArtifactValue]> {
  switch (type.kind) {
    case "struct": {
      if (visiting.has(type.name)) throw stateError("SILVER_STATE_INVALID", `cyclic struct ${type.name}`);
      const s = artifact.structs[type.name];
      if (!s) throw stateError("SILVER_STATE_INVALID", `unknown struct ${type.name}`);
      const fields = objectOf(where, value, s.fields);
      visiting.add(type.name);
      const leaves = s.fields.flatMap((f) => flattenValue(artifact, `${where}.${f.name}`, f.type, fields[f.name]!, visiting));
      visiting.delete(type.name);
      return leaves;
    }
    case "fixed_array":
    case "dynamic_array": {
      const len = type.kind === "fixed_array" ? type.len : undefined;
      const itemLeaves = flattenTypes(artifact, type.item, new Set(visiting));
      if (itemLeaves.length === 1 && sameType(itemLeaves[0]!, type.item)) return [[arrayType(type.item, len), value]];
      const items = arrayOf(where, value, len);
      const columns: SilArtifactValue[][] = itemLeaves.map(() => []);
      items.forEach((item, i) => {
        const leaves = flattenValue(artifact, `${where}[${i}]`, type.item, item, visiting);
        if (leaves.length !== itemLeaves.length || leaves.some(([t], k) => !sameType(t, itemLeaves[k]!))) {
          throw stateError("SILVER_STATE_INVALID", `invalid flattened state layout for ${where}`);
        }
        leaves.forEach(([, v], k) => columns[k]!.push(v));
      });
      return itemLeaves.map((leaf, k) => [arrayType(leaf, len), { kind: "array", value: columns[k]! }]);
    }
    default:
      return [[type, value]];
  }
}

/** silverscript-abi `encode_state_payload`. */
function statePayload(where: string, type: SilTypeArtifact, value: SilArtifactValue): Uint8Array {
  switch (type.kind) {
    case "bytes":
      return bytesOf(where, value);
    case "string":
      if (value?.kind !== "text") throw stateError("SILVER_ABI_ARGUMENT_INVALID", `${where}: expected text`);
      return new Uint8Array(Buffer.from(value.value, "utf8"));
    case "dynamic_array":
      return silArrayPayload(where, type.item, undefined, value);
    default:
      return silFixedPayload(where, type, value);
  }
}

/** kaspa-txscript `add_data_with_push_opcode`: the push opcode chosen by length only (no small-int opcodes). */
function explicitPush(data: Uint8Array): string {
  const n = data.length;
  if (n === 0) return "00";
  let prefix: string;
  if (n <= 75) prefix = n.toString(16).padStart(2, "0");
  else if (n <= 0xff) prefix = "4c" + n.toString(16).padStart(2, "0");
  else if (n <= 0xffff) prefix = "4d" + hex(Uint8Array.of(n & 0xff, n >> 8));
  else prefix = "4e" + hex(Uint8Array.of(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff));
  return prefix + hex(data);
}

function contractOf(artifact: SilAbiArtifact, contractName?: string): { name: string; contract: SilContractArtifact } {
  return getSilContract(artifact, contractName);
}

/** silverscript-abi `encode_runtime_state_script`: the state span of a contract for these State values (hex). */
export function encodeSilverRuntimeState(artifact: SilAbiArtifact, contractName: string | undefined, values: Readonly<Record<string, SilArtifactValue>>): string {
  const { contract } = contractOf(artifact, contractName);
  const fields = contract.runtime_state.fields;
  const unknown = Object.keys(values).filter((k) => !fields.some((f) => f.name === k));
  if (unknown.length > 0) throw stateError("SILVER_STATE_INVALID", `not State fields: ${unknown.join(", ")}`);
  let out = "";
  for (const field of fields) {
    const value = values[field.name];
    if (value === undefined) throw stateError("SILVER_STATE_INVALID", `missing State field '${field.name}'`);
    for (const [type, leaf] of flattenValue(artifact, field.name, field.type, value)) out += explicitPush(statePayload(field.name, type, leaf));
  }
  return out;
}

function parsePushes(script: Uint8Array): Uint8Array[] {
  const pushes: Uint8Array[] = [];
  let o = 0;
  const read = (n: number) => {
    if (o + n > script.length) throw stateError("SILVER_STATE_INVALID", `a push at ${o} needs ${n} bytes, ${script.length - o} remain`);
    const b = script.subarray(o, o + n);
    o += n;
    return b;
  };
  while (o < script.length) {
    const op = script[o++]!;
    let len: number;
    if (op === 0x00) {
      pushes.push(new Uint8Array());
      continue;
    } else if (op >= 0x01 && op <= 0x4b) len = op;
    else if (op === 0x4c) len = read(1)[0]!;
    else if (op === 0x4d) {
      const b = read(2);
      len = b[0]! | (b[1]! << 8);
    } else if (op === 0x4e) {
      const b = read(4);
      len = (b[0]! | (b[1]! << 8) | (b[2]! << 16)) + b[3]! * 0x1000000;
    } else throw stateError("SILVER_STATE_INVALID", `opcode 0x${op.toString(16)} is not a push-data opcode of a state span`);
    pushes.push(new Uint8Array(read(len)));
  }
  return pushes;
}

function decodeLeaf(where: string, type: SilTypeArtifact, payload: Uint8Array): SilArtifactValue {
  const need = (n: number) => {
    if (payload.length !== n) throw stateError("SILVER_STATE_INVALID", `${where}: expected ${n} bytes, got ${payload.length}`);
  };
  switch (type.kind) {
    case "int":
    case "temporal":
      need(8);
      return { kind: "int", value: silScriptNumberValue(payload) };
    case "bool":
      need(1);
      if (payload[0]! > 1) throw stateError("SILVER_STATE_INVALID", `${where}: a bool byte is 0 or 1`);
      return { kind: "bool", value: payload[0] === 1 };
    case "byte":
      need(1);
      return { kind: "byte", value: payload[0]! };
    case "bytes":
      return { kind: "bytes", value: Array.from(payload) };
    case "string":
      return { kind: "text", value: Buffer.from(payload).toString("utf8") };
    case "pubkey":
      need(32);
      return { kind: "bytes", value: Array.from(payload) };
    case "sig":
      need(65);
      return { kind: "bytes", value: Array.from(payload) };
    case "datasig":
      need(64);
      return { kind: "bytes", value: Array.from(payload) };
    case "fixed_bytes":
      need(type.len);
      return { kind: "bytes", value: Array.from(payload) };
    case "fixed_array":
    case "dynamic_array": {
      const itemLen = fixedPayloadLen(type.item);
      if (!itemLen || payload.length % itemLen !== 0) throw stateError("SILVER_STATE_INVALID", `${where}: ${payload.length} bytes are not whole items`);
      const count = payload.length / itemLen;
      if (type.kind === "fixed_array" && count !== type.len) throw stateError("SILVER_STATE_INVALID", `${where}: expected ${type.len} items, got ${count}`);
      const items: SilArtifactValue[] = [];
      for (let i = 0; i < count; i++) items.push(decodeLeaf(`${where}[${i}]`, type.item, payload.subarray(i * itemLen, (i + 1) * itemLen)));
      return { kind: "array", value: items };
    }
    default:
      throw stateError("SILVER_STATE_INVALID", `${where}: a ${type.kind} is not a state leaf`);
  }
}

function rebuild(artifact: SilAbiArtifact, where: string, type: SilTypeArtifact, leaves: readonly SilArtifactValue[]): [SilArtifactValue, number] {
  if (type.kind === "struct") {
    const s = artifact.structs[type.name];
    if (!s) throw stateError("SILVER_STATE_INVALID", `unknown struct ${type.name}`);
    const value: Record<string, SilArtifactValue> = {};
    let used = 0;
    for (const f of s.fields) {
      const [v, n] = rebuild(artifact, `${where}.${f.name}`, f.type, leaves.slice(used));
      value[f.name] = v;
      used += n;
    }
    return [{ kind: "object", value }, used];
  }
  if (type.kind === "fixed_array" || type.kind === "dynamic_array") {
    const itemLeaves = flattenTypes(artifact, type.item);
    if (itemLeaves.length === 1 && sameType(itemLeaves[0]!, type.item)) {
      if (leaves.length === 0) throw stateError("SILVER_STATE_INVALID", `${where}: missing value`);
      return [leaves[0]!, 1];
    }
    const columns = leaves.slice(0, itemLeaves.length).map((c) => (c.kind === "array" ? c.value : undefined));
    if (columns.length !== itemLeaves.length || columns.some((c) => c === undefined)) throw stateError("SILVER_STATE_INVALID", `${where}: missing values`);
    const count = columns[0]!.length;
    if (type.kind === "fixed_array" && count !== type.len) throw stateError("SILVER_STATE_INVALID", `${where}: expected ${type.len} items`);
    if (columns.some((c) => c!.length !== count)) throw stateError("SILVER_STATE_INVALID", `${where}: columns of different lengths`);
    const items: SilArtifactValue[] = [];
    for (let i = 0; i < count; i++) {
      const [v, n] = rebuild(artifact, `${where}[${i}]`, type.item, columns.map((c) => c![i]!));
      if (n !== itemLeaves.length) throw stateError("SILVER_STATE_INVALID", `invalid flattened state layout for ${where}`);
      items.push(v);
    }
    return [{ kind: "array", value: items }, itemLeaves.length];
  }
  if (leaves.length === 0) throw stateError("SILVER_STATE_INVALID", `${where}: missing value`);
  return [leaves[0]!, 1];
}

/**
 * silverscript-abi `decode_runtime_state_script`, refusing what is not canonical: the decoded values must encode back to
 * exactly these bytes (SILVER_STATE_NOT_CANONICAL).
 */
export function decodeSilverRuntimeState(artifact: SilAbiArtifact, contractName: string | undefined, stateHex: string): Record<string, SilArtifactValue> {
  const { contract } = contractOf(artifact, contractName);
  const pushes = parsePushes(unhex(stateHex));
  const leafTypes = contract.runtime_state.fields.map((f) => flattenTypes(artifact, f.type));
  const expected = leafTypes.reduce((s, l) => s + l.length, 0);
  if (pushes.length !== expected) throw stateError("SILVER_STATE_INVALID", `expected ${expected} state pushes, got ${pushes.length}`);
  const values: Record<string, SilArtifactValue> = {};
  let p = 0;
  contract.runtime_state.fields.forEach((field, fi) => {
    const leaves = leafTypes[fi]!.map((t) => decodeLeaf(field.name, t, pushes[p++]!));
    const [value, used] = rebuild(artifact, field.name, field.type, leaves);
    if (used !== leaves.length) throw stateError("SILVER_STATE_INVALID", `invalid flattened state layout for ${field.name}`);
    values[field.name] = value;
  });
  if (encodeSilverRuntimeState(artifact, contractName, values) !== stateHex.toLowerCase()) {
    throw stateError("SILVER_STATE_NOT_CANONICAL", "the state span is not the canonical encoding of its values");
  }
  return values;
}

/** KCC-1 / silverscript-abi `template_hash`: blake3(len(prefix) ‖ prefix ‖ len(suffix) ‖ suffix), lengths as 8-byte script numbers. */
export function silverTemplateHash(prefixHex: string, suffixHex: string): string {
  const prefix = unhex(prefixHex);
  const suffix = unhex(suffixHex);
  const data = new Uint8Array([...silScriptNumber(BigInt(prefix.length), 8), ...prefix, ...silScriptNumber(BigInt(suffix.length), 8), ...suffix]);
  return hex(blake3(data));
}

/** The template prefix, state span and template suffix of a compiled contract (hex). */
export function silverContractParts(contract: SilContractArtifact): { prefix: string; state: string; suffix: string } {
  const code = silContractBytecodeHex(contract);
  const { offset, len } = contract.compiled.state_span;
  return { prefix: code.slice(0, offset * 2), state: code.slice(offset * 2, (offset + len) * 2), suffix: code.slice((offset + len) * 2) };
}

/**
 * silverscript-abi `verify_compiled_contract`, the part that concerns the template: the state span decodes canonically and
 * the template hash is the hash of the prefix and suffix around it (SILVER_ARTIFACT_INCONSISTENT otherwise). Returns the
 * decoded state and the template hash.
 */
export function verifySilverTemplate(artifact: SilAbiArtifact, contractName?: string): { state: Record<string, SilArtifactValue>; templateHash: string } {
  const { name, contract } = contractOf(artifact, contractName);
  const parts = silverContractParts(contract);
  let state: Record<string, SilArtifactValue>;
  try {
    state = decodeSilverRuntimeState(artifact, name, parts.state);
  } catch (e: any) {
    throw stateError("SILVER_ARTIFACT_INCONSISTENT", `contract '${name}': its state span does not decode (${e?.message ?? e})`);
  }
  const templateHash = silverTemplateHash(parts.prefix, parts.suffix);
  if (templateHash !== hex(contract.compiled.template_hash)) {
    throw stateError("SILVER_ARTIFACT_INCONSISTENT", `contract '${name}': template hash ${hex(contract.compiled.template_hash)}, its prefix and suffix hash to ${templateHash}`);
  }
  return { state, templateHash };
}

/**
 * The covenant script carrying `state` in this contract's template: prefix ‖ encoded state ‖ suffix, with its P2SH lock.
 * The template (and its hash) is the contract's own, checked first.
 */
export function silverStateSuccessor(
  artifact: SilAbiArtifact,
  contractName: string | undefined,
  state: Readonly<Record<string, SilArtifactValue>>
): { bytecodeHex: string; stateHex: string; templateHash: string; lock: { version: number; script: string } } {
  const { name, contract } = contractOf(artifact, contractName);
  const { templateHash } = verifySilverTemplate(artifact, name);
  const parts = silverContractParts(contract);
  const stateHex = encodeSilverRuntimeState(artifact, name, state);
  const bytecodeHex = parts.prefix + stateHex + parts.suffix;
  const k = loadManagedKaspaWasmSync();
  const spk = k.payToScriptHashScript(bytecodeHex);
  const o = typeof spk?.serializeToObject === "function" ? spk.serializeToObject() : spk;
  return { bytecodeHex, stateHex, templateHash, lock: { version: Number(o.version), script: String(o.script) } };
}
