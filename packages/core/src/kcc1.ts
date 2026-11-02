import { blake3 } from "@noble/hashes/blake3.js";
import { blake2b } from "@noble/hashes/blake2.js";

/**
 * KCC-1 · Covenant Concepts, Byte Layouts, and ABI (kaspanet/kccs, Final).
 *
 * The convention's byte layer, independent of any source language, compiler or artifact format: the Hash Function,
 * canonical type names, PushMinimal / PushExplicit, the int encodings, scalar, array and record payloads (record lowering
 * and record-array grouping), value locations, dispatch tags, PushArguments, the P2SH covenant envelope, state encoding,
 * reading a consumed state, template hashes, template views, continuation programs, the leader and delegator roles of a
 * shared transition, and the hash-committed virtual element scheme.
 *
 * Decoders are strict: a decoded value must re-encode to exactly the bytes it came from (non-canonical pushes, ints that
 * are not minimal or negative zero, wrong lengths, invalid payloads, missing or trailing elements are refused). The
 * official machine-readable vectors (kcc-0001/vectors/conformance.json at the pinned commit) are the conformance test.
 *
 * What KCC-1 conformance means (KCC-1 §7): independent tools can construct, decode and authenticate invocations and
 * continuations. It says nothing about whether a covenant program is correct, and none of this changes consensus.
 */

export const KCC_SOURCE = {
  repository: "kaspanet/kccs",
  commit: "1ed87aef59faff8354061aee30f734a3b8b2c3d2",
  documents: { kcc1: "kcc-0001.md", kcc2: "kcc-0002.md", kcc20: "kcc-0020.md" },
  status: "Final"
} as const;

function kccError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

// ---------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------

const HEX = /^(?:[0-9a-fA-F]{2})*$/;

/** A byte string from hex (no 0x prefix, even length), a Uint8Array or an array of bytes. */
export function kccBytes(value: unknown, where: string): Uint8Array {
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (typeof value === "string") {
    if (!HEX.test(value)) throw kccError("KCC1_VALUE_INVALID", `${where}: '${value.slice(0, 40)}' is not an even-length hex string without a prefix`);
    return Uint8Array.from(Buffer.from(value, "hex"));
  }
  if (Array.isArray(value) && value.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) return Uint8Array.from(value as number[]);
  throw kccError("KCC1_VALUE_INVALID", `${where}: expected a byte string (hex, Uint8Array or byte array)`);
}

export const kccHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");

function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function le(n: bigint | number, width: number): Uint8Array {
  let v = BigInt(n);
  const out = new Uint8Array(width);
  for (let i = 0; i < width; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

// ---------------------------------------------------------------------------
// §3.2.1 Hash Function
// ---------------------------------------------------------------------------

/** `Key32(key) = key || 00^(32 - len(key))`; the key holds at most 32 bytes. */
export function kcc1Key32(key: Uint8Array): Uint8Array {
  if (key.length > 32) throw kccError("KCC1_HASH_KEY_TOO_LONG", `a KCC-1 hash key holds at most 32 bytes, got ${key.length}`);
  const out = new Uint8Array(32);
  out.set(key);
  return out;
}

/** `Hash(x)` (unkeyed BLAKE3, 32 bytes) or `Hash(x, key)` (BLAKE3 keyed with Key32(key)). */
export function kcc1Hash(data: Uint8Array, key?: Uint8Array): Uint8Array {
  return key === undefined ? blake3(data) : blake3(data, { key: kcc1Key32(key) });
}

/** The P2SH redeem-script commitment: unkeyed BLAKE2b with a 32-byte output (§3.6). */
export function kcc1Blake2b(data: Uint8Array): Uint8Array {
  return blake2b(data, { dkLen: 32 });
}

// ---------------------------------------------------------------------------
// §3.4.1 Types
// ---------------------------------------------------------------------------

export type Kcc1ScalarName = "int" | "bool" | "byte" | "string" | "pubkey" | "sig" | "datasig";
const SCALARS: readonly Kcc1ScalarName[] = ["int", "bool", "byte", "string", "pubkey", "sig", "datasig"];

export type Kcc1Type =
  | { readonly kind: "scalar"; readonly name: Kcc1ScalarName }
  /** `length` absent: a dynamic array `T[]`; `byte[N]` is the fixed array of N bytes. */
  | { readonly kind: "array"; readonly item: Kcc1Type; readonly length?: number | undefined }
  | { readonly kind: "record"; readonly name: string };

export interface Kcc1Field {
  readonly name: string;
  readonly type: Kcc1Type;
}

export interface Kcc1Record {
  readonly name: string;
  /** Field order is part of the Program ABI. */
  readonly fields: readonly Kcc1Field[];
}

/** Record definitions by their exact, case-sensitive name. */
export type Kcc1Records = Readonly<Record<string, Kcc1Record>>;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TYPE_TEXT = /^([A-Za-z_][A-Za-z0-9_]*)((?:\[(?:0|[1-9][0-9]*)?\])*)$/;

/** Parses a KCC-1 type name (`int`, `byte[32]`, `bool[3]`, `int[]`, `Transfer`, `Point[2][]`, …). */
export function kcc1ParseType(text: string): Kcc1Type {
  const m = TYPE_TEXT.exec(text);
  if (!m) throw kccError("KCC1_TYPE_INVALID", `'${text}' is not a KCC-1 type name`);
  let type: Kcc1Type = (SCALARS as readonly string[]).includes(m[1]!) ? { kind: "scalar", name: m[1] as Kcc1ScalarName } : { kind: "record", name: m[1]! };
  for (const s of m[2]!.match(/\[[0-9]*\]/g) ?? []) {
    const digits = s.slice(1, -1);
    if (digits === "") {
      type = { kind: "array", item: type };
    } else {
      const length = Number(digits);
      if (!Number.isSafeInteger(length)) throw kccError("KCC1_TYPE_INVALID", `'${text}': array length ${digits} is too large`);
      type = { kind: "array", item: type, length };
    }
  }
  return type;
}

const asType = (t: Kcc1Type | string): Kcc1Type => (typeof t === "string" ? kcc1ParseType(t) : t);

function recordOf(records: Kcc1Records, name: string, where: string): Kcc1Record {
  const r = Object.prototype.hasOwnProperty.call(records, name) ? records[name] : undefined;
  if (!r) throw kccError("KCC1_TYPE_INVALID", `${where}: unknown record '${name}'`);
  return r;
}

/** `TypeName(T)` (§3.4.1). */
export function kcc1TypeName(type: Kcc1Type | string): string {
  const t = asType(type);
  if (t.kind === "scalar") return t.name;
  if (t.kind === "record") return t.name;
  return `${kcc1TypeName(t.item)}[${t.length ?? ""}]`;
}

/** `DispatchTypeName(T)` (§3.5.1): a record is `{…}` of its ordered field types; names are omitted. */
export function kcc1DispatchTypeName(type: Kcc1Type | string, records: Kcc1Records = {}): string {
  return dispatchName(asType(type), records, []);
}

function dispatchName(t: Kcc1Type, records: Kcc1Records, seen: readonly string[]): string {
  if (t.kind === "scalar") return t.name;
  if (t.kind === "array") return `${dispatchName(t.item, records, seen)}[${t.length ?? ""}]`;
  if (seen.includes(t.name)) throw kccError("KCC1_TYPE_INVALID", `record '${t.name}' contains itself`);
  const r = recordOf(records, t.name, "dispatch type name");
  return `{${r.fields.map((f) => dispatchName(f.type, records, [...seen, t.name])).join(",")}}`;
}

function containsRecord(t: Kcc1Type): boolean {
  return t.kind === "record" || (t.kind === "array" && containsRecord(t.item));
}

/** The fixed payload width of T, or undefined when T has none (`string`, dynamic arrays, records holding either). */
export function kcc1FixedWidth(type: Kcc1Type | string, records: Kcc1Records = {}): number | undefined {
  const t = asType(type);
  if (t.kind === "scalar") return { int: 8, bool: 1, byte: 1, string: undefined, pubkey: 32, sig: 65, datasig: 64 }[t.name];
  if (t.kind === "array") {
    if (t.length === undefined) return undefined;
    const w = kcc1FixedWidth(t.item, records);
    return w === undefined ? undefined : w * t.length;
  }
  let sum = 0;
  for (const f of recordOf(records, t.name, "fixed width").fields) {
    const w = kcc1FixedWidth(f.type, records);
    if (w === undefined) return undefined;
    sum += w;
  }
  return sum;
}

interface Slot {
  /** Field path from the lowered type's root. */
  readonly path: readonly string[];
  /** A scalar, or an array without records (after grouping). */
  readonly type: Kcc1Type;
}

/** §3.4.6 recursive lowering: a record expands into its fields; an array of records into one array per lowered leaf. */
function slotsOf(t: Kcc1Type, records: Kcc1Records, seen: readonly string[] = []): Slot[] {
  if (t.kind === "scalar") return [{ path: [], type: t }];
  if (t.kind === "record") {
    if (seen.includes(t.name)) throw kccError("KCC1_TYPE_INVALID", `record '${t.name}' contains itself`);
    return recordOf(records, t.name, "lowering").fields.flatMap((f) =>
      slotsOf(f.type, records, [...seen, t.name]).map((s) => ({ path: [f.name, ...s.path], type: s.type }))
    );
  }
  if (!containsRecord(t.item)) return [{ path: [], type: t }];
  return slotsOf(t.item, records, seen).map((s) => ({ path: s.path, type: { kind: "array" as const, item: s.type, length: t.length } }));
}

/**
 * The type rules of §3.4.5 and §3.4.6: identifiers, known and non-recursive records, array items with a fixed payload
 * width (positive for a dynamic array), and, for an array of records, a positive fixed width for every lowered leaf.
 */
export function kcc1ValidateType(type: Kcc1Type | string, records: Kcc1Records = {}, where = "type"): void {
  validate(asType(type), records, where, []);
}

function validate(t: Kcc1Type, records: Kcc1Records, where: string, seen: readonly string[]): void {
  if (t.kind === "scalar") return;
  if (t.kind === "record") {
    if (!IDENTIFIER.test(t.name)) throw kccError("KCC1_TYPE_INVALID", `${where}: '${t.name}' is not a valid record name`);
    if (seen.includes(t.name)) throw kccError("KCC1_TYPE_INVALID", `${where}: record '${t.name}' contains itself`);
    const r = recordOf(records, t.name, where);
    const names = new Set<string>();
    for (const f of r.fields) {
      if (!IDENTIFIER.test(f.name)) throw kccError("KCC1_TYPE_INVALID", `${where}: '${t.name}.${f.name}' is not a valid field name`);
      if (names.has(f.name)) throw kccError("KCC1_TYPE_INVALID", `${where}: record '${t.name}' declares '${f.name}' twice`);
      names.add(f.name);
      validate(f.type, records, `${where}.${f.name}`, [...seen, t.name]);
    }
    return;
  }
  if (t.length !== undefined && (!Number.isSafeInteger(t.length) || t.length < 0)) throw kccError("KCC1_TYPE_INVALID", `${where}: invalid array length`);
  validate(t.item, records, `${where}[]`, seen);
  if (containsRecord(t.item)) {
    const slots = slotsOf(t.item, records, seen);
    // the grouped fields carry the array's count: an item that lowers to nothing would lose it
    if (slots.length === 0) throw kccError("KCC1_TYPE_INVALID", `${where}: an array of records needs at least one lowered field (${kcc1TypeName(t.item)} has none)`);
    for (const s of slots) {
      const w = kcc1FixedWidth(s.type, records);
      if (w === undefined || w <= 0) {
        throw kccError("KCC1_TYPE_INVALID", `${where}: an array of records needs a positive fixed payload width for every lowered leaf ('${[...s.path].join(".")}' is ${kcc1TypeName(s.type)})`);
      }
    }
    return;
  }
  const w = kcc1FixedWidth(t.item, records);
  if (w === undefined) throw kccError("KCC1_TYPE_INVALID", `${where}: an array needs items with a fixed payload width (${kcc1TypeName(t.item)} has none)`);
  if (t.length === undefined && w <= 0) throw kccError("KCC1_TYPE_INVALID", `${where}: a dynamic array needs items of positive width (${kcc1TypeName(t.item)} is ${w})`);
}

// ---------------------------------------------------------------------------
// §3.4.2 Data pushes
// ---------------------------------------------------------------------------

function pushData(b: Uint8Array, minimal: boolean): Uint8Array {
  const n = b.length;
  if (n === 0) return Uint8Array.of(0x00);
  if (minimal && n === 1 && b[0]! >= 0x01 && b[0]! <= 0x10) return Uint8Array.of(0x50 + b[0]!);
  if (minimal && n === 1 && b[0] === 0x81) return Uint8Array.of(0x4f);
  if (n <= 75) return concat(Uint8Array.of(n), b);
  if (n <= 255) return concat(Uint8Array.of(0x4c, n), b);
  if (n <= 65535) return concat(Uint8Array.of(0x4d), le(n, 2), b);
  if (n <= 0xffffffff) return concat(Uint8Array.of(0x4e), le(n, 4), b);
  throw kccError("KCC1_PUSH_INVALID", `a payload of ${n} bytes has no data push`);
}

/** `PushMinimal(b)`: invocation arguments (OP_1..OP_16 and OP_1NEGATE for those one-byte payloads). */
export const kcc1PushMinimal = (payload: Uint8Array): Uint8Array => pushData(payload, true);
/** `PushExplicit(b)`: encoded state fields (always a length-based push for a non-empty payload). */
export const kcc1PushExplicit = (payload: Uint8Array): Uint8Array => pushData(payload, false);

interface Push {
  readonly payload: Uint8Array;
  readonly start: number;
  readonly end: number;
}

/** One data push at `offset`; refuses a non-push opcode or a truncated push. */
function readPush(bytes: Uint8Array, offset: number, where: string): Push {
  const op = bytes[offset];
  if (op === undefined) throw kccError("KCC1_DECODE_INVALID", `${where}: a push is missing`);
  const take = (from: number, n: number): Push => {
    if (from + n > bytes.length) throw kccError("KCC1_PUSH_INVALID", `${where}: the data push is truncated`);
    return { payload: bytes.slice(from, from + n), start: offset, end: from + n };
  };
  const len = (width: number): number => {
    if (offset + 1 + width > bytes.length) throw kccError("KCC1_PUSH_INVALID", `${where}: the push length is truncated`);
    let n = 0;
    for (let i = width - 1; i >= 0; i--) n = n * 256 + bytes[offset + 1 + i]!;
    return n;
  };
  if (op === 0x00) return { payload: new Uint8Array(0), start: offset, end: offset + 1 };
  if (op >= 0x01 && op <= 0x4b) return take(offset + 1, op);
  if (op === 0x4c) return take(offset + 2, len(1));
  if (op === 0x4d) return take(offset + 3, len(2));
  if (op === 0x4e) return take(offset + 5, len(4));
  if (op === 0x4f) return { payload: Uint8Array.of(0x81), start: offset, end: offset + 1 };
  if (op >= 0x51 && op <= 0x60) return { payload: Uint8Array.of(op - 0x50), start: offset, end: offset + 1 };
  throw kccError("KCC1_PUSH_INVALID", `${where}: opcode 0x${op.toString(16).padStart(2, "0")} is not a data push`);
}

/** Every push of `bytes`, each in the canonical form of its mode (PushMinimal, or PushExplicit for state). */
function readPushes(bytes: Uint8Array, minimal: boolean, where: string): Push[] {
  const out: Push[] = [];
  let o = 0;
  while (o < bytes.length) {
    const p = readPush(bytes, o, `${where} push ${out.length}`);
    if (!equalBytes(pushData(p.payload, minimal), bytes.slice(p.start, p.end))) {
      throw kccError("KCC1_PUSH_NONCANONICAL", `${where} push ${out.length}: ${kccHex(bytes.slice(p.start, p.end)).slice(0, 24)} is not ${minimal ? "PushMinimal" : "PushExplicit"} of its payload`);
    }
    out.push(p);
    o = p.end;
  }
  return out;
}

// ---------------------------------------------------------------------------
// §3.4.3 / §3.4.4 Integers and scalar payloads
// ---------------------------------------------------------------------------

const INT_MAX = (1n << 63n) - 1n;

function intValue(v: unknown, where: string): bigint {
  if (typeof v === "bigint") {
    // fall through
  } else if (typeof v === "number" && Number.isSafeInteger(v)) {
    v = BigInt(v);
  } else if (typeof v === "string" && /^-?(0|[1-9][0-9]*)$/.test(v)) {
    v = BigInt(v);
  } else {
    throw kccError("KCC1_VALUE_INVALID", `${where}: expected an int (bigint, safe integer or decimal string)`);
  }
  const n = v as bigint;
  if (n > INT_MAX || n < -INT_MAX) throw kccError("KCC1_INT_OUT_OF_RANGE", `${where}: ${n} is outside -(2^63 - 1)..2^63 - 1`);
  return n;
}

/** The minimal ScriptNum of an int (empty for zero). */
export function kcc1ScriptNum(value: bigint | number | string): Uint8Array {
  const n = intValue(value, "int");
  if (n === 0n) return new Uint8Array(0);
  const neg = n < 0n;
  let mag = neg ? -n : n;
  const out: number[] = [];
  while (mag > 0n) {
    out.push(Number(mag & 0xffn));
    mag >>= 8n;
  }
  if (out[out.length - 1]! & 0x80) out.push(neg ? 0x80 : 0x00);
  else if (neg) out[out.length - 1]! |= 0x80;
  return Uint8Array.from(out);
}

function scriptNumDecode(b: Uint8Array, where: string): bigint {
  if (b.length === 0) return 0n;
  if (b.length > 8) throw kccError("KCC1_DECODE_INVALID", `${where}: a ScriptNum of ${b.length} bytes is outside the int range`);
  const last = b[b.length - 1]!;
  if ((last & 0x7f) === 0 && (b.length === 1 || (b[b.length - 2]! & 0x80) === 0)) {
    throw kccError("KCC1_DECODE_INVALID", `${where}: ${kccHex(b)} is not a minimal ScriptNum`);
  }
  let mag = 0n;
  for (let i = b.length - 1; i >= 0; i--) mag = (mag << 8n) | BigInt(i === b.length - 1 ? b[i]! & 0x7f : b[i]!);
  return last & 0x80 ? -mag : mag;
}

/** The eight-byte little-endian signed-magnitude int payload (state, arrays, packed values). */
export function kcc1Int8(value: bigint | number | string): Uint8Array {
  const n = intValue(value, "int");
  const out = le(n < 0n ? -n : n, 8);
  if (n < 0n) out[7]! |= 0x80;
  return out;
}

/** Decodes an eight-byte signed-magnitude payload; `negativeZero: "reject"` (KCC-1 ints) or "zero" (KCC-20 thresholds). */
export function kcc1DecodeInt8(b: Uint8Array, where = "int", negativeZero: "reject" | "zero" = "reject"): bigint {
  if (b.length !== 8) throw kccError("KCC1_DECODE_INVALID", `${where}: an int payload has exactly 8 bytes, got ${b.length}`);
  let mag = 0n;
  for (let i = 7; i >= 0; i--) mag = (mag << 8n) | BigInt(i === 7 ? b[i]! & 0x7f : b[i]!);
  const neg = (b[7]! & 0x80) !== 0;
  if (neg && mag === 0n) {
    if (negativeZero === "reject") throw kccError("KCC1_DECODE_INVALID", `${where}: negative zero is not the canonical encoding of 0`);
    return 0n;
  }
  return neg ? -mag : mag;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/**
 * Values, by type: int → bigint (or a safe integer / decimal string when encoding); bool → boolean; byte → number 0..255;
 * string → string; pubkey, sig, datasig and arrays of byte (`byte[N]`, `byte[]`) → byte strings (hex when decoded); other
 * arrays → arrays; records → objects keyed by field name.
 */
export type Kcc1Value = bigint | number | boolean | string | Uint8Array | readonly Kcc1Value[] | { readonly [field: string]: Kcc1Value };

const isByteString = (t: Kcc1Type): boolean =>
  (t.kind === "scalar" && (t.name === "pubkey" || t.name === "sig" || t.name === "datasig")) ||
  (t.kind === "array" && t.item.kind === "scalar" && t.item.name === "byte");

function byteValue(v: unknown, where: string): number {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 255) return v;
  if (typeof v === "string" && /^[0-9a-fA-F]{2}$/.test(v)) return parseInt(v, 16);
  throw kccError("KCC1_VALUE_INVALID", `${where}: expected a byte (0..255 or two hex digits)`);
}

function elements(v: unknown, length: number | undefined, where: string): readonly unknown[] {
  if (!Array.isArray(v)) throw kccError("KCC1_VALUE_INVALID", `${where}: expected an array`);
  if (length !== undefined && v.length !== length) throw kccError("KCC1_VALUE_INVALID", `${where}: a fixed array holds exactly ${length} elements, got ${v.length}`);
  return v;
}

function fieldsOf(v: unknown, r: Kcc1Record, where: string): Readonly<Record<string, unknown>> {
  if (v === null || typeof v !== "object" || Array.isArray(v) || v instanceof Uint8Array) throw kccError("KCC1_VALUE_INVALID", `${where}: expected a ${r.name} record`);
  const o = v as Record<string, unknown>;
  const extra = Object.keys(o).filter((k) => !r.fields.some((f) => f.name === k));
  if (extra.length > 0) throw kccError("KCC1_VALUE_INVALID", `${where}: ${r.name} has no field(s) ${extra.join(", ")}`);
  for (const f of r.fields) if (!(f.name in o)) throw kccError("KCC1_VALUE_INVALID", `${where}: missing ${r.name}.${f.name}`);
  return o;
}

/** The canonical fixed payload of a value of a fixed-width type (§3.4.4, §3.4.5; records concatenated, for Packed). */
function fixedPayload(t: Kcc1Type, v: unknown, records: Kcc1Records, where: string): Uint8Array {
  if (t.kind === "scalar") {
    switch (t.name) {
      case "int":
        return kcc1Int8(intValue(v, where));
      case "bool":
        if (typeof v !== "boolean") throw kccError("KCC1_VALUE_INVALID", `${where}: expected a bool`);
        return Uint8Array.of(v ? 1 : 0);
      case "byte":
        return Uint8Array.of(byteValue(v, where));
      case "string":
        throw kccError("KCC1_PACKED_NOT_FIXED", `${where}: string has no fixed payload width`);
      default:
        return exactBytes(v, { pubkey: 32, sig: 65, datasig: 64 }[t.name], where);
    }
  }
  if (t.kind === "array") {
    if (t.length === undefined) throw kccError("KCC1_PACKED_NOT_FIXED", `${where}: a dynamic array has no fixed payload width`);
    return arrayPayload(t, v, records, where);
  }
  const r = recordOf(records, t.name, where);
  const o = fieldsOf(v, r, where);
  return concat(...r.fields.map((f) => fixedPayload(f.type, o[f.name], records, `${where}.${f.name}`)));
}

function exactBytes(v: unknown, length: number, where: string): Uint8Array {
  const b = kccBytes(v, where);
  if (b.length !== length) throw kccError("KCC1_VALUE_INVALID", `${where}: expected exactly ${length} bytes, got ${b.length}`);
  return b;
}

/** An array payload: its elements' fixed payloads, in index order (§3.4.5). */
function arrayPayload(t: Extract<Kcc1Type, { kind: "array" }>, v: unknown, records: Kcc1Records, where: string): Uint8Array {
  if (t.item.kind === "scalar" && t.item.name === "byte") {
    // a byte string, or the bytes one by one (numbers or two hex digits, as a standalone byte takes them)
    const b = Array.isArray(v) ? Uint8Array.from(v.map((e, i) => byteValue(e, `${where}[${i}]`))) : kccBytes(v, where);
    if (t.length !== undefined && b.length !== t.length) throw kccError("KCC1_VALUE_INVALID", `${where}: byte[${t.length}] holds exactly ${t.length} bytes, got ${b.length}`);
    return b;
  }
  return concat(...elements(v, t.length, where).map((e, i) => fixedPayload(t.item, e, records, `${where}[${i}]`)));
}

/** The leaves of a value lowered by §3.4.6, in slot order. */
function lowerValue(t: Kcc1Type, v: unknown, records: Kcc1Records, where: string): { type: Kcc1Type; value: unknown; where: string }[] {
  if (t.kind === "scalar" || (t.kind === "array" && !containsRecord(t.item))) return [{ type: t, value: v, where }];
  if (t.kind === "record") {
    const r = recordOf(records, t.name, where);
    const o = fieldsOf(v, r, where);
    return r.fields.flatMap((f) => lowerValue(f.type, o[f.name], records, `${where}.${f.name}`));
  }
  const items = elements(v, t.length, where).map((e, i) => lowerValue(t.item, e, records, `${where}[${i}]`));
  return slotsOf(t.item, records).map((s, k) => ({
    type: { kind: "array" as const, item: s.type, length: t.length },
    value: items.map((leaves) => leaves[k]!.value),
    where: `${where}[*]${s.path.length ? "." + s.path.join(".") : ""}`
  }));
}

/** The payload of one lowered leaf as a standalone argument (§3.4.3, §3.4.4). */
function argumentPush(t: Kcc1Type, v: unknown, records: Kcc1Records, where: string): Uint8Array {
  if (t.kind === "scalar") {
    if (t.name === "int") return kcc1PushMinimal(kcc1ScriptNum(intValue(v, where)));
    if (t.name === "bool") {
      if (typeof v !== "boolean") throw kccError("KCC1_VALUE_INVALID", `${where}: expected a bool`);
      return Uint8Array.of(v ? 0x51 : 0x00);
    }
    if (t.name === "string") return kcc1PushMinimal(utf8Payload(v, where));
    return kcc1PushMinimal(fixedPayload(t, v, records, where));
  }
  if (t.kind === "array") return kcc1PushMinimal(arrayPayload(t, v, records, where));
  throw kccError("KCC1_TYPE_INVALID", `${where}: a record is lowered before it is pushed`);
}

/** `StatePayload(T, v)` of one lowered state leaf (§3.7.1). */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** `UTF8(s)`; a string with a lone surrogate has no UTF-8 encoding (TextEncoder would write U+FFFD instead). */
function utf8Payload(v: unknown, where: string): Uint8Array {
  if (typeof v !== "string") throw kccError("KCC1_VALUE_INVALID", `${where}: expected a string`);
  if (LONE_SURROGATE.test(v)) throw kccError("KCC1_VALUE_INVALID", `${where}: the string holds a lone surrogate and has no UTF-8 encoding`);
  return new TextEncoder().encode(v);
}

function statePayload(t: Kcc1Type, v: unknown, records: Kcc1Records, where: string): Uint8Array {
  if (t.kind === "scalar" && t.name === "string") return utf8Payload(v, where);
  if (t.kind === "array") return arrayPayload(t, v, records, where);
  return fixedPayload(t, v, records, where);
}

// ---------------------------------------------------------------------------
// Decoding leaves
// ---------------------------------------------------------------------------

// fatal: invalid UTF-8 is refused; ignoreBOM: a leading U+FEFF is part of the string, never stripped
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function decodeFixed(t: Kcc1Type, b: Uint8Array, records: Kcc1Records, where: string): unknown {
  if (t.kind === "scalar") {
    switch (t.name) {
      case "int":
        return kcc1DecodeInt8(b, where);
      case "bool":
        if (b.length !== 1 || b[0]! > 1) throw kccError("KCC1_DECODE_INVALID", `${where}: a bool payload is exactly 00 or 01`);
        return b[0] === 1;
      case "byte":
        if (b.length !== 1) throw kccError("KCC1_DECODE_INVALID", `${where}: a byte payload has exactly 1 byte, got ${b.length}`);
        return b[0]!;
      default: {
        const n = { pubkey: 32, sig: 65, datasig: 64, string: -1 }[t.name];
        if (b.length !== n) throw kccError("KCC1_DECODE_INVALID", `${where}: a ${t.name} payload has exactly ${n} bytes, got ${b.length}`);
        return kccHex(b);
      }
    }
  }
  if (t.kind === "array") return decodeArray(t, b, records, where);
  throw kccError("KCC1_TYPE_INVALID", `${where}: records are lowered before decoding`);
}

function decodeArray(t: Extract<Kcc1Type, { kind: "array" }>, b: Uint8Array, records: Kcc1Records, where: string): unknown {
  const w = kcc1FixedWidth(t.item, records);
  if (w === undefined) throw kccError("KCC1_TYPE_INVALID", `${where}: array items need a fixed width`);
  let count: number;
  if (t.length !== undefined) {
    if (b.length !== w * t.length) throw kccError("KCC1_DECODE_INVALID", `${where}: ${kcc1TypeName(t)} has a ${w * t.length}-byte payload, got ${b.length}`);
    count = t.length;
  } else {
    if (w <= 0) throw kccError("KCC1_TYPE_INVALID", `${where}: dynamic array items need a positive width`);
    if (b.length % w !== 0) throw kccError("KCC1_DECODE_INVALID", `${where}: ${b.length} bytes is not a multiple of the ${w}-byte item width`);
    count = b.length / w;
  }
  if (t.item.kind === "scalar" && t.item.name === "byte") return kccHex(b);
  return Array.from({ length: count }, (_, i) => decodeFixed(t.item, b.slice(i * w, (i + 1) * w), records, `${where}[${i}]`));
}

/** A lowered argument leaf from its push payload (the push itself was checked canonical PushMinimal). */
function decodeArgumentLeaf(t: Kcc1Type, payload: Uint8Array, records: Kcc1Records, where: string): unknown {
  if (t.kind === "scalar") {
    if (t.name === "int") return scriptNumDecode(payload, where);
    if (t.name === "bool") {
      if (payload.length === 0) return false;
      if (payload.length === 1 && payload[0] === 1) return true;
      throw kccError("KCC1_DECODE_INVALID", `${where}: a standalone bool is OP_0 or OP_1`);
    }
    if (t.name === "string") {
      try {
        return UTF8.decode(payload);
      } catch {
        throw kccError("KCC1_DECODE_INVALID", `${where}: the string payload is not valid UTF-8`);
      }
    }
  }
  return decodeFixed(t, payload, records, where);
}

/** A lowered state leaf from its PushExplicit payload. */
function decodeStateLeaf(t: Kcc1Type, payload: Uint8Array, records: Kcc1Records, where: string): unknown {
  if (t.kind === "scalar" && t.name === "string") {
    try {
      return UTF8.decode(payload);
    } catch {
      throw kccError("KCC1_DECODE_INVALID", `${where}: the string payload is not valid UTF-8`);
    }
  }
  return decodeFixed(t, payload, records, where);
}

/** Rebuilds a value from its decoded leaves (the reverse of lowering); record-array groups must agree on their count. */
function raise(t: Kcc1Type, leaves: unknown[], records: Kcc1Records, where: string): unknown {
  if (t.kind === "scalar" || (t.kind === "array" && !containsRecord(t.item))) return leaves.shift();
  if (t.kind === "record") {
    const r = recordOf(records, t.name, where);
    return Object.fromEntries(r.fields.map((f) => [f.name, raise(f.type, leaves, records, `${where}.${f.name}`)]));
  }
  const slots = slotsOf(t.item, records);
  // a group of `byte` leaves decodes as one byte string: back to one byte per record
  const groups = slots.map(() => {
    const g = leaves.shift();
    return typeof g === "string" ? Array.from(Buffer.from(g, "hex")) : (g as unknown[]);
  });
  const counts = new Set(groups.map((g) => g.length));
  if (counts.size > 1) throw kccError("KCC1_DECODE_INVALID", `${where}: the record-array field groups hold different counts (${groups.map((g) => g.length).join(", ")})`);
  const count = groups[0]?.length ?? 0;
  if (t.length !== undefined && count !== t.length) throw kccError("KCC1_DECODE_INVALID", `${where}: a fixed record array holds ${t.length} records, got ${count}`);
  return Array.from({ length: count }, (_, i) => raise(t.item, groups.map((g) => g[i]), records, `${where}[${i}]`));
}

// ---------------------------------------------------------------------------
// §3.5 Entrypoints, dispatch tags and arguments
// ---------------------------------------------------------------------------

/** `FunctionSignature` = `name(DispatchTypeName(T_1),…)`, as a string (its UTF-8 bytes are hashed). */
export function kcc1FunctionSignature(name: string, types: readonly (Kcc1Type | string)[], records: Kcc1Records = {}): string {
  if (!IDENTIFIER.test(name)) throw kccError("KCC1_TYPE_INVALID", `'${name}' is not a valid entrypoint name`);
  return `${name}(${types.map((t) => kcc1DispatchTypeName(t, records)).join(",")})`;
}

/**
 * Parses a FunctionSignature written with dispatch type names (§3.5.1): `name(T_1,...,T_n)`, each T a scalar type name or
 * `{...}` of dispatch type names, with array suffixes, and no whitespace. A record name never appears in a dispatch
 * signature (its fields do, between braces), so one is refused rather than hashed into a tag no program uses.
 */
export function kcc1ParseFunctionSignature(text: string): { name: string; dispatchTypeNames: string[] } {
  const bad = (why: string): never => {
    throw kccError("KCC1_TYPE_INVALID", `'${text}' is not a function signature: ${why}`);
  };
  const open = text.indexOf("(");
  const name = open < 0 ? "" : text.slice(0, open);
  if (!IDENTIFIER.test(name) || !text.endsWith(")")) bad("expected name(type,...)");
  const args = text.slice(open + 1, -1);
  let i = 0;
  const type = (): void => {
    if (args[i] === "{") {
      i++;
      if (args[i] !== "}") {
        type();
        while (args[i] === ",") {
          i++;
          type();
        }
      }
      if (args[i] !== "}") bad(`expected '}' at ${i}`);
      i++;
    } else {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(args.slice(i));
      if (!m) bad(`expected a type at ${i}`);
      if (!(SCALARS as readonly string[]).includes(m![0])) bad(`'${m![0]}' is not a scalar type name (a record is written as {field types})`);
      i += m![0].length;
    }
    while (args[i] === "[") {
      const m = /^\[(0|[1-9][0-9]*)?\]/.exec(args.slice(i));
      if (!m) bad(`invalid array suffix at ${i}`);
      i += m![0].length;
    }
  };
  const names: string[] = [];
  if (args !== "") {
    for (;;) {
      const start = i;
      type();
      names.push(args.slice(start, i));
      if (i === args.length) break;
      if (args[i] !== ",") bad(`expected ',' at ${i}`);
      i++;
    }
  }
  return { name, dispatchTypeNames: names };
}

/** `dispatch_tag = Hash(UTF8(FunctionSignature))[0:4]`, as 8 hex digits. */
export function kcc1DispatchTagOfSignature(functionSignature: string): string {
  return kccHex(kcc1Hash(new TextEncoder().encode(functionSignature)).slice(0, 4));
}

export function kcc1DispatchTag(name: string, types: readonly (Kcc1Type | string)[], records: Kcc1Records = {}): string {
  return kcc1DispatchTagOfSignature(kcc1FunctionSignature(name, types, records));
}

export interface Kcc1Entrypoint {
  readonly name: string;
  readonly argumentTypes: readonly (Kcc1Type | string)[];
}

/**
 * A program's entrypoints together (§3.5, §3.5.1): at least one, every argument type valid, and distinct dispatch tags —
 * identical signature preimages (record or field renaming included) and truncated-hash collisions are both refused.
 */
export function kcc1ValidateEntrypoints(entrypoints: readonly Kcc1Entrypoint[], records: Kcc1Records = {}): { name: string; functionSignature: string; dispatchTag: string }[] {
  if (entrypoints.length === 0) throw kccError("KCC1_ENTRYPOINTS_EMPTY", "a covenant program contains at least one entrypoint");
  const out = entrypoints.map((e) => {
    e.argumentTypes.forEach((t, i) => kcc1ValidateType(t, records, `${e.name} argument ${i}`));
    const functionSignature = kcc1FunctionSignature(e.name, e.argumentTypes, records);
    return { name: e.name, functionSignature, dispatchTag: kcc1DispatchTagOfSignature(functionSignature) };
  });
  const seen = new Map<string, string>();
  for (const e of out) {
    const other = seen.get(e.dispatchTag);
    if (other !== undefined) {
      throw kccError("KCC1_DISPATCH_TAG_COLLISION", `${other} and ${e.functionSignature} share the dispatch tag ${e.dispatchTag}`);
    }
    seen.set(e.dispatchTag, e.functionSignature);
  }
  return out;
}

/** `PushArguments(arguments)`: the canonical pushes of every recursively lowered argument, in parameter order (§3.5.2). */
export function kcc1EncodeArguments(types: readonly (Kcc1Type | string)[], values: readonly unknown[], records: Kcc1Records = {}): Uint8Array {
  if (types.length !== values.length) throw kccError("KCC1_VALUE_INVALID", `${types.length} argument types, ${values.length} values`);
  return concat(
    ...types.flatMap((type, i) => {
      const t = asType(type);
      kcc1ValidateType(t, records, `argument ${i}`);
      return lowerValue(t, values[i], records, `argument ${i}`).map((leaf) => argumentPush(leaf.type, leaf.value, records, leaf.where));
    })
  );
}

/** The arguments of `argumentHex`, which must be exactly the canonical push sequence for `types` (no tag, no script). */
export function kcc1DecodeArguments(argumentHex: string | Uint8Array, types: readonly (Kcc1Type | string)[], records: Kcc1Records = {}): unknown[] {
  const bytes = kccBytes(argumentHex, "arguments");
  const ts = types.map(asType);
  ts.forEach((t, i) => kcc1ValidateType(t, records, `argument ${i}`));
  const slots = ts.flatMap((t, i) => slotsOf(t, records).map((s) => ({ ...s, where: `argument ${i}${s.path.length ? "." + s.path.join(".") : ""}` })));
  const pushes = readPushes(bytes, true, "arguments");
  if (pushes.length !== slots.length) {
    throw kccError("KCC1_DECODE_INVALID", `arguments: ${slots.length} lowered element(s) expected, ${pushes.length} push(es) found`);
  }
  const leaves = slots.map((s, k) => decodeArgumentLeaf(s.type, pushes[k]!.payload, records, s.where));
  const values = ts.map((t, i) => raise(t, leaves, records, `argument ${i}`));
  if (!equalBytes(kcc1EncodeArguments(ts, values, records), bytes)) throw kccError("KCC1_DECODE_INVALID", "arguments do not re-encode to the same bytes");
  return values;
}

// ---------------------------------------------------------------------------
// §3.7.1 State encoding
// ---------------------------------------------------------------------------

/** I-05 · a state layout names each field once (as a record does): a duplicate would encode, then never decode. */
function assertStateFields(fields: readonly Kcc1Field[]): void {
  const names = new Set<string>();
  for (const f of fields) {
    if (names.has(f.name)) throw kccError("KCC1_TYPE_INVALID", `state: the layout declares '${f.name}' twice`);
    names.add(f.name);
  }
}

function stateSlots(fields: readonly Kcc1Field[], records: Kcc1Records): (Slot & { where: string })[] {
  assertStateFields(fields);
  return fields.flatMap((f) => {
    kcc1ValidateType(f.type, records, `state.${f.name}`);
    return slotsOf(f.type, records).map((s) => ({ path: [f.name, ...s.path], type: s.type, where: `state.${[f.name, ...s.path].join(".")}` }));
  });
}

/** `EncodeState(state)`: one PushExplicit per lowered field, in declaration order. */
export function kcc1EncodeState(fields: readonly Kcc1Field[], state: Readonly<Record<string, unknown>>, records: Kcc1Records = {}): Uint8Array {
  assertStateFields(fields);
  const r: Kcc1Record = { name: "state", fields };
  const o = fieldsOf(state, r, "state");
  return concat(
    ...fields.flatMap((f) => {
      kcc1ValidateType(f.type, records, `state.${f.name}`);
      return lowerValue(f.type, o[f.name], records, `state.${f.name}`).map((leaf) => kcc1PushExplicit(statePayload(leaf.type, leaf.value, records, leaf.where)));
    })
  );
}

export interface Kcc1StateField {
  /** The lowered field's path, from the state root. */
  readonly path: readonly string[];
  readonly type: Kcc1Type;
  /** Byte range of its encoded push within the encoded state. */
  readonly start: number;
  readonly end: number;
}

/**
 * Decodes a complete encoded state: exactly one canonical PushExplicit per lowered field, every payload valid, nothing
 * missing or trailing, and the decoded values re-encode to the same bytes. Returns the values and each field's range.
 */
export function kcc1DecodeState(encoded: string | Uint8Array, fields: readonly Kcc1Field[], records: Kcc1Records = {}): { state: Record<string, unknown>; fields: Kcc1StateField[] } {
  const bytes = kccBytes(encoded, "encoded state");
  const slots = stateSlots(fields, records);
  const pushes: Push[] = [];
  let o = 0;
  for (const s of slots) {
    if (o >= bytes.length) throw kccError("KCC1_DECODE_INVALID", `${s.where}: the field is missing`);
    const p = readPush(bytes, o, s.where);
    if (!equalBytes(kcc1PushExplicit(p.payload), bytes.slice(p.start, p.end))) {
      throw kccError("KCC1_PUSH_NONCANONICAL", `${s.where}: ${kccHex(bytes.slice(p.start, p.end)).slice(0, 24)} is not PushExplicit of its payload`);
    }
    pushes.push(p);
    o = p.end;
  }
  if (o !== bytes.length) throw kccError("KCC1_DECODE_INVALID", `encoded state: ${bytes.length - o} trailing byte(s)`);
  const leaves = slots.map((s, k) => decodeStateLeaf(s.type, pushes[k]!.payload, records, s.where));
  const state = Object.fromEntries(fields.map((f) => [f.name, raise(f.type, leaves, records, `state.${f.name}`)]));
  if (!equalBytes(kcc1EncodeState(fields, state, records), bytes)) throw kccError("KCC1_DECODE_INVALID", "the encoded state does not re-encode to the same bytes");
  return { state, fields: slots.map((s, k) => ({ path: s.path, type: s.type, start: pushes[k]!.start, end: pushes[k]!.end })) };
}

// ---------------------------------------------------------------------------
// §3.6 P2SH covenant envelope
// ---------------------------------------------------------------------------

export interface Kcc1ScriptPublicKey {
  readonly version: number;
  readonly scriptHex: string;
}

/** `Blake2b(R)`, the 32-byte value the envelope commits to. */
export const kcc1P2shCommitment = (redeemScript: Uint8Array): Uint8Array => kcc1Blake2b(redeemScript);

/** The version-0 script public key `OP_BLAKE2B OP_DATA_32 Blake2b(R) OP_EQUAL`. */
export function kcc1P2shScriptPublicKey(redeemScript: Uint8Array): Kcc1ScriptPublicKey {
  return kcc1P2shScriptPublicKeyOfCommitment(kcc1P2shCommitment(redeemScript));
}

export function kcc1P2shScriptPublicKeyOfCommitment(commitment: Uint8Array): Kcc1ScriptPublicKey {
  if (commitment.length !== 32) throw kccError("KCC1_P2SH_INVALID", "a P2SH commitment has 32 bytes");
  return { version: 0, scriptHex: `aa20${kccHex(commitment)}87` };
}

/** The spending signature script: `PushArguments(arguments) || OP_DATA_4 dispatch_tag || PushMinimal(R)`. */
export function kcc1SignatureScript(pushArguments: Uint8Array, dispatchTagHex: string, redeemScript: Uint8Array): Uint8Array {
  readPushes(pushArguments, true, "arguments");
  const tag = kccBytes(dispatchTagHex, "dispatch tag");
  if (tag.length !== 4) throw kccError("KCC1_P2SH_INVALID", "a dispatch tag has 4 bytes");
  return concat(pushArguments, Uint8Array.of(0x04), tag, kcc1PushMinimal(redeemScript));
}

export interface Kcc1Invocation {
  /** The argument pushes, as they are in the script (decode them with the entrypoint's types). */
  readonly pushArguments: Uint8Array;
  readonly dispatchTagHex: string;
  readonly redeemScript: Uint8Array;
}

/**
 * The invocation in a spending signature script: push-only, canonical pushes, the dispatch tag as `OP_DATA_4` + 4 bytes
 * and `PushMinimal(R)` as the final push. When the consumed output's script public key is given, it must be the version-0
 * envelope of `R`.
 */
export function kcc1ParseSignatureScript(signatureScript: string | Uint8Array, consumed?: Kcc1ScriptPublicKey): Kcc1Invocation {
  const bytes = kccBytes(signatureScript, "signature script");
  const pushes = readPushes(bytes, true, "signature script");
  if (pushes.length < 2) throw kccError("KCC1_P2SH_INVALID", "the signature script needs a dispatch tag and a redeem script");
  const r = pushes[pushes.length - 1]!;
  const tag = pushes[pushes.length - 2]!;
  if (bytes[tag.start] !== 0x04 || tag.payload.length !== 4) throw kccError("KCC1_P2SH_INVALID", "the dispatch tag is not OP_DATA_4 followed by 4 bytes");
  if (consumed) {
    const expected = kcc1P2shScriptPublicKey(r.payload);
    if (consumed.version !== expected.version || consumed.scriptHex.toLowerCase() !== expected.scriptHex) {
      throw kccError("KCC1_P2SH_INVALID", "the redeem script does not match the consumed output's version-0 P2SH script public key");
    }
  }
  return { pushArguments: bytes.slice(0, tag.start), dispatchTagHex: kccHex(tag.payload), redeemScript: r.payload };
}

// ---------------------------------------------------------------------------
// §3.7 Templates, views, continuations
// ---------------------------------------------------------------------------

export interface Kcc1Template {
  readonly prefix: Uint8Array;
  readonly encodedState: Uint8Array;
  readonly suffix: Uint8Array;
}

/** `R = prefix || encoded_state || suffix` for a declared state range (a stateless program uses 0, 0). */
export function kcc1SplitProgram(redeemScript: Uint8Array, stateStart: number, stateLen: number): Kcc1Template {
  if (!Number.isSafeInteger(stateStart) || !Number.isSafeInteger(stateLen) || stateStart < 0 || stateLen < 0 || stateStart + stateLen > redeemScript.length) {
    throw kccError("KCC1_TEMPLATE_INVALID", `state range ${stateStart}+${stateLen} is outside a ${redeemScript.length}-byte program`);
  }
  return {
    prefix: redeemScript.slice(0, stateStart),
    encodedState: redeemScript.slice(stateStart, stateStart + stateLen),
    suffix: redeemScript.slice(stateStart + stateLen)
  };
}

/** `TemplateHash(prefix, suffix) = Hash(LE64(len(prefix)) || prefix || LE64(len(suffix)) || suffix)`. */
export function kcc1TemplateHash(prefix: Uint8Array, suffix: Uint8Array): Uint8Array {
  return kcc1Hash(concat(le(prefix.length, 8), prefix, le(suffix.length, 8), suffix));
}

/** A claimed template hash is verified from both parts before they are used (§3.7.3). */
export function kcc1VerifyTemplateHash(prefix: Uint8Array, suffix: Uint8Array, claimedHex: string): void {
  const actual = kccHex(kcc1TemplateHash(prefix, suffix));
  if (actual !== claimedHex.toLowerCase()) throw kccError("KCC1_TEMPLATE_HASH_MISMATCH", `template hash ${actual}, claimed ${claimedHex}`);
}

/**
 * Reads the state of a consumed instance (§3.7.2): validates the P2SH invocation (and, when given, that the consumed
 * script public key commits to its R), the bounds of the state range, then decodes the range strictly.
 */
export function kcc1ReadConsumedState(params: {
  readonly signatureScript: string | Uint8Array;
  readonly consumed?: Kcc1ScriptPublicKey | undefined;
  readonly stateStart: number;
  readonly stateLen: number;
  readonly fields: readonly Kcc1Field[];
  readonly records?: Kcc1Records | undefined;
}): { state: Record<string, unknown>; invocation: Kcc1Invocation; template: Kcc1Template } {
  const invocation = kcc1ParseSignatureScript(params.signatureScript, params.consumed);
  const template = kcc1SplitProgram(invocation.redeemScript, params.stateStart, params.stateLen);
  return { state: kcc1DecodeState(template.encodedState, params.fields, params.records ?? {}).state, invocation, template };
}

export interface Kcc1View {
  readonly start: number;
  readonly len: number;
  readonly prefix: Uint8Array;
  readonly encodedState: Uint8Array;
  readonly suffix: Uint8Array;
  readonly templateHash: Uint8Array;
}

/**
 * A template view (§3.7.4): a non-empty range within the complete encoded state made of complete, consecutive lowered
 * fields. Select it by top-level field names (`fieldNames`) or by its byte range (`range`, absolute offsets in R).
 */
export function kcc1TemplateView(params: {
  readonly redeemScript: Uint8Array;
  readonly stateStart: number;
  readonly stateLen: number;
  readonly fields: readonly Kcc1Field[];
  readonly records?: Kcc1Records | undefined;
  readonly fieldNames?: readonly string[] | undefined;
  readonly range?: { readonly start: number; readonly len: number } | undefined;
}): Kcc1View {
  const records = params.records ?? {};
  const whole = kcc1SplitProgram(params.redeemScript, params.stateStart, params.stateLen);
  const decoded = kcc1DecodeState(whole.encodedState, params.fields, records).fields;
  let start: number;
  let end: number;
  if (params.fieldNames) {
    const names = params.fieldNames;
    const idx = names.map((n) => params.fields.findIndex((f) => f.name === n));
    if (names.length === 0 || idx.some((i) => i < 0) || idx.some((i, k) => k > 0 && i !== idx[k - 1]! + 1)) {
      throw kccError("KCC1_VIEW_INVALID", `a view selects one or more consecutive state fields, got [${names.join(", ")}]`);
    }
    const sel = decoded.filter((f) => names.includes(f.path[0]!));
    if (sel.length === 0) throw kccError("KCC1_VIEW_INVALID", `fields [${names.join(", ")}] encode no bytes: a view selects a non-empty range`);
    start = params.stateStart + sel[0]!.start;
    end = params.stateStart + sel[sel.length - 1]!.end;
  } else if (params.range) {
    start = params.range.start;
    end = params.range.start + params.range.len;
    const startsAt = decoded.some((f) => params.stateStart + f.start === start);
    const endsAt = decoded.some((f) => params.stateStart + f.end === end);
    if (params.range.len <= 0 || start < params.stateStart || end > params.stateStart + params.stateLen || !startsAt || !endsAt) {
      throw kccError("KCC1_VIEW_INVALID", `range ${start}+${params.range.len} is not made of complete consecutive encoded fields`);
    }
  } else {
    throw kccError("KCC1_VIEW_INVALID", "a view needs field names or a byte range");
  }
  const prefix = params.redeemScript.slice(0, start);
  const suffix = params.redeemScript.slice(end);
  return { start, len: end - start, prefix, encodedState: params.redeemScript.slice(start, end), suffix, templateHash: kcc1TemplateHash(prefix, suffix) };
}

/** A continuation under a template or view (§3.7.5): `R_next = prefix || EncodeState(next_state) || suffix`. */
export function kcc1ContinuationProgram(prefix: Uint8Array, encodedNextState: Uint8Array, suffix: Uint8Array): { redeemScript: Uint8Array; commitment: Uint8Array; scriptPublicKey: Kcc1ScriptPublicKey } {
  const redeemScript = concat(prefix, encodedNextState, suffix);
  const commitment = kcc1P2shCommitment(redeemScript);
  return { redeemScript, commitment, scriptPublicKey: kcc1P2shScriptPublicKeyOfCommitment(commitment) };
}

// ---------------------------------------------------------------------------
// §3.4.7 Value locations
// ---------------------------------------------------------------------------

export type Kcc1PathSegment = { readonly field: string } | { readonly index: number };

/**
 * The value a location's path selects in a decoded value of `type` (a KCC-1 type, or a state layout: its fields). A field
 * segment needs a record holding that field, an index segment an array holding that index (a byte string is an array of
 * byte; a scalar such as pubkey or string is not); anything else makes the location invalid.
 */
export function kcc1ResolveLocation(root: unknown, type: Kcc1Type | string | readonly Kcc1Field[], path: readonly Kcc1PathSegment[], records: Kcc1Records = {}): unknown {
  let v: unknown = root;
  let t: Kcc1Type | readonly Kcc1Field[] = Array.isArray(type) ? type : asType(type as Kcc1Type | string);
  path.forEach((seg, i) => {
    if ("field" in seg) {
      const fields = Array.isArray(t) ? t : (t as Kcc1Type).kind === "record" ? recordOf(records, (t as { name: string }).name, `segment ${i}`).fields : undefined;
      const field = fields?.find((f) => f.name === seg.field);
      if (!field || v === null || typeof v !== "object" || Array.isArray(v) || !Object.prototype.hasOwnProperty.call(v, seg.field)) {
        throw kccError("KCC1_LOCATION_INVALID", `segment ${i}: field '${seg.field}' is not in the decoded record`);
      }
      v = (v as Record<string, unknown>)[seg.field];
      t = field.type;
      return;
    }
    const arr = Array.isArray(t) ? undefined : (t as Kcc1Type);
    if (!arr || arr.kind !== "array") throw kccError("KCC1_LOCATION_INVALID", `segment ${i}: an index selects an array element, not a part of a ${Array.isArray(t) ? "state" : kcc1TypeName(t as Kcc1Type)}`);
    const byteString = arr.item.kind === "scalar" && arr.item.name === "byte";
    const items: unknown[] | undefined = byteString ? (typeof v === "string" && HEX.test(v) ? Array.from(Buffer.from(v, "hex")) : v instanceof Uint8Array ? Array.from(v) : undefined) : Array.isArray(v) ? v : undefined;
    if (!items || !Number.isInteger(seg.index) || seg.index < 0 || seg.index >= items.length) {
      throw kccError("KCC1_LOCATION_INVALID", `segment ${i}: index ${seg.index} is not in the decoded array`);
    }
    v = items[seg.index];
    t = arr.item;
  });
  return v;
}

// ---------------------------------------------------------------------------
// §3.8.1 Leader and delegator roles
// ---------------------------------------------------------------------------

/**
 * The roles in the shared context of `covenantIdHex` (KIP-20; ordered by input index): the first participating input is
 * the leader, every later one a delegator. Undefined when no input carries that Covenant ID.
 */
export function kcc1SharedRoles(inputCovenantIds: readonly (string | null | undefined)[], covenantIdHex: string): { leader: number; delegators: number[] } | undefined {
  const id = covenantIdHex.toLowerCase();
  const members = inputCovenantIds.flatMap((c, i) => (c && c.toLowerCase() === id ? [i] : []));
  return members.length === 0 ? undefined : { leader: members[0]!, delegators: members.slice(1) };
}

/** The role an input takes by its position in its own Covenant ID's shared context, or undefined without a binding. */
export function kcc1RoleOfInput(inputCovenantIds: readonly (string | null | undefined)[], inputIndex: number): "leader" | "delegator" | undefined {
  const id = inputCovenantIds[inputIndex];
  if (!id) return undefined;
  return kcc1SharedRoles(inputCovenantIds, id)!.leader === inputIndex ? "leader" : "delegator";
}

// ---------------------------------------------------------------------------
// §3.9 Virtual elements
// ---------------------------------------------------------------------------

/** `Packed(value)`: the fixed payloads of the values in declaration order, without push opcodes (statically fixed width). */
export function kcc1Packed(values: readonly { readonly type: Kcc1Type | string; readonly value: unknown }[], records: Kcc1Records = {}): Uint8Array {
  return concat(
    ...values.map((v, i) => {
      const t = asType(v.type);
      kcc1ValidateType(t, records, `packed ${i}`);
      if (kcc1FixedWidth(t, records) === undefined) throw kccError("KCC1_PACKED_NOT_FIXED", `packed ${i}: ${kcc1TypeName(t)} has no statically known width`);
      return fixedPayload(t, v.value, records, `packed ${i}`);
    })
  );
}

/** The hash-committed virtual element scheme (§3.9.1): `commitment = Hash(payload)`. */
export const kcc1VirtualCommitment = (payload: Uint8Array): Uint8Array => kcc1Hash(payload);

/** An opening is verified before its value is used: `Hash(payload) = commitment`. */
export function kcc1VerifyOpening(payload: Uint8Array, commitment: Uint8Array): boolean {
  return equalBytes(kcc1Hash(payload), commitment);
}
