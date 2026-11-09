import { sha256 } from "@noble/hashes/sha2.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { blake3 } from "@noble/hashes/blake3.js";
import { schnorr, secp256k1 } from "@noble/curves/secp256k1";
import { Op, opcodeName, UNSUPPORTED_OPCODES, DISABLED_OPCODES, ALWAYS_ILLEGAL_OPCODES } from "./opcodes.js";
import {
  calcKaspaSchnorrSignatureHash,
  ALLOWED_SIGHASH_TYPES,
  type KaspaSighashTransaction,
  type KaspaSighashUtxo
} from "../crypto/kaspa-sighash.js";
import {
  EMPTY_COVENANTS_CONTEXT,
  CovenantsError,
  ZERO_HASH_HEX,
  numAuthOutputs,
  authOutputIndex,
  numCovenantInputs,
  covenantInputIndex,
  numCovenantOutputs,
  covenantOutputIndex,
  type CovenantsContext
} from "./covenants.js";

/*
 * Kaspa txscript engine, ported from rusty-kaspa v2.1.0 (`crypto/txscript/src/lib.rs` `TxScriptEngine`,
 * `opcodes/mod.rs`, `data_stack.rs`, `runtime_resource_meter.rs`; ACTIVE CONSENSUS). What the port keeps exactly:
 * - script layout: the signature script must be push-only; the alt stack does not survive a script; P2SH restores the
 *   stack left by the signature script, pops the redeem script and runs it; at the end exactly one TRUE item must remain
 *   (CleanStack / EmptyStack / EvalFalse); a script public key of version > 0 is accepted without execution;
 * - opcodes: every opcode v2.1.0 enables (arithmetic, bitwise, splice, Toccata introspection, covenant opcodes,
 *   CheckSigFromStack, ECDSA, keyed hashes) with its upstream stack discipline (pop/peek), numeric decoding (signed,
 *   at most 8 bytes; u64 LE for CLTV/CSV operands) and errors; disabled and always-illegal opcodes fail even in a branch
 *   that is not executed; combined stack limit 244, element limit 1 000 000, 1 000 000 non-push ops per script;
 * - metering: script units charged as the node charges them (100 000 per signature check, 1 per newly pushed byte,
 *   2/1/1 per hashed byte for BLAKE2B/SHA256/BLAKE3, 100 per byte of script public key beyond 35) against the limit the
 *   caller passes (the input's committed script units).
 * Not reproduced (fail closed with SCRIPT_UNSUPPORTED_OPCODE): OpZkPrecompile and OpChainblockSeqCommit.
 * Every failure is a typed result (`code`); the engine never throws.
 */

// ── Constants (lib.rs:76-91, units.rs) ─────────────────────────────────────

export const MAX_SCRIPT_PUBLIC_KEY_VERSION = 0;
export const MAX_STACK_SIZE = 244;
export const MAX_SCRIPTS_SIZE = 1_000_000;
export const MAX_SCRIPT_ELEMENT_SIZE = 1_000_000;
export const MAX_OPS_PER_SCRIPT = 1_000_000;
export const MAX_TX_IN_SEQUENCE_NUM = (1n << 64n) - 1n;
export const SEQUENCE_LOCK_TIME_DISABLED = 1n << 63n;
export const SEQUENCE_LOCK_TIME_MASK = 0xffffffffn;
export const LOCK_TIME_THRESHOLD = 500_000_000_000n;
export const MAX_PUB_KEYS_PER_MULTISIG = 20;
/** The last opcode that is a push (counts no operation). */
export const NO_COST_OPCODE = 0x60;
export const STANDARD_SCRIPT_PUBLIC_KEY_MAX_SIZE = 35;
export const SCRIPT_UNITS_PER_GRAM = 100n;
/** EngineFlags::default / params.mass_per_sig_op = 1000 grams → 100 000 script units per signature check. */
export const DEFAULT_SIGOP_SCRIPT_UNITS = 1000n * SCRIPT_UNITS_PER_GRAM;

const I64_MIN = -(1n << 63n);
const I64_MAX = (1n << 63n) - 1n;
const I32_MIN = -(1n << 31n);
const I32_MAX = (1n << 31n) - 1n;
const U64_MAX = (1n << 64n) - 1n;
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const ECDSA_DOMAIN_HASH = sha256(new TextEncoder().encode("TransactionSigningHashECDSA"));

// ── Public types ───────────────────────────────────────────────────────────

/** A spent output as the engine reads it for introspection (`UtxoEntry`). */
export interface ScriptUtxoEntry {
  readonly amount: bigint;
  readonly scriptPublicKey: { readonly version: number; /** hex */ readonly script: string };
  readonly blockDaaScore: bigint;
  readonly isCoinbase: boolean;
  /** 32-byte hex, when the UTXO carries a covenant id. */
  readonly covenantId?: string | undefined;
}

export interface ScriptExecutionContext {
  readonly tx: KaspaSighashTransaction;
  readonly inputIndex: number;
  /** The output this input spends (its script public key version is honoured). */
  readonly utxo: KaspaSighashUtxo;
  readonly currentDaaScore?: bigint;
  /** Every input's spent UTXO, for the introspection opcodes; defaults to `utxo` at `inputIndex` only. */
  readonly utxos?: ReadonlyArray<ScriptUtxoEntry | undefined>;
  /** CovenantsContext::from_tx of the transaction; defaults to the empty context. */
  readonly covenants?: CovenantsContext;
  /** The input's committed script units (`allowed_script_units`); unlimited when omitted. */
  readonly scriptUnitsLimit?: bigint;
  /** Script units charged per signature check (default 100 000). */
  readonly sigopScriptUnits?: bigint;
  /**
   * Every input's signature script (hex), for OpTxInputScriptSig{Len,Substr}. Defaults to a `signatureScript` field on
   * the transaction's inputs when they carry one.
   */
  readonly signatureScripts?: ReadonlyArray<string>;
}

export interface ScriptExecutionResult {
  readonly success: boolean;
  /** "<CODE>: <rusty-kaspa message>". */
  readonly error?: string;
  /** Stable error code (SCRIPT_*), present when success is false. */
  readonly code?: string;
  readonly stack: readonly Uint8Array[];
  readonly usedScriptUnits?: bigint;
  readonly usedSigOps?: number;
}

/** A txscript failure (`kaspa_txscript_errors::TxScriptError`), with a stable code and the upstream message. */
export class ScriptError extends Error {
  constructor(readonly code: string, readonly detail: string) {
    super(`${code}: ${detail}`);
    this.name = "ScriptError";
  }
}

const err = (code: string, detail: string) => new ScriptError(code, detail);
const invalidStackOperation = (need: number, have: number) =>
  err("SCRIPT_INVALID_STACK_OPERATION", `opcode requires at least ${need} but stack has only ${have}`);
const numberTooBig = (detail: string) => err("SCRIPT_NUMBER_TOO_BIG", `Number too big: ${detail}`);
const invalidState = (detail: string) => err("SCRIPT_INVALID_STATE", `encountered invalid state while running script: ${detail}`);
const unsatisfiedLockTime = (detail: string) => err("SCRIPT_UNSATISFIED_LOCK_TIME", `Unsatisfied lock time: ${detail}`);
const invalidInputIndex = (idx: bigint | number, len: number) =>
  err("SCRIPT_INVALID_INPUT_INDEX", `transaction input ${idx} is out of bounds, should be non-negative below ${len}`);
const invalidOutputIndex = (idx: bigint | number, len: number) =>
  err("SCRIPT_INVALID_OUTPUT_INDEX", `transaction output ${idx} is out of bounds, should be non-negative below ${len}`);
const elementTooBig = (size: number, max: number) => err("SCRIPT_ELEMENT_TOO_BIG", `element size ${size} exceeds max allowed size ${max}`);

function hexToBytes(s: string): Uint8Array {
  const clean = s.replace(/^0x/, "").toLowerCase();
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/.test(clean)) throw err("SCRIPT_INVALID_STATE", `encountered invalid state while running script: '${s.slice(0, 16)}…' is not hex`);
  return Uint8Array.from(Buffer.from(clean, "hex"));
}

function hexOf(b: Uint8Array): string {
  return Buffer.from(b).toString("hex");
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const r = new Uint8Array(a.length + b.length);
  r.set(a, 0);
  r.set(b, a.length);
  return r;
}

/** ScriptPublicKey::to_bytes (`lib.rs:911-915`): the version as 2 bytes BIG endian, then the script. */
function spkToBytes(spk: { readonly version: number; readonly script: string }): Uint8Array {
  const script = hexToBytes(spk.script);
  const out = new Uint8Array(2 + script.length);
  out[0] = (spk.version >> 8) & 0xff;
  out[1] = spk.version & 0xff;
  out.set(script, 2);
  return out;
}

function u64Le(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt.asUintN(64, n), true);
  return b;
}

// ── Script numbers (data_stack.rs) ─────────────────────────────────────────

/**
 * deserialize_i64: little endian, sign in the high bit of the last byte, at most `maxBytes` (8) bytes, no minimality.
 * Kept for API compatibility: throws a ScriptError (SCRIPT_NUMBER_TOO_BIG) for an operand longer than `maxBytes`.
 */
export function decodeScriptNum(b: Uint8Array, maxBytes = 8): bigint {
  if (b.length > maxBytes) {
    throw numberTooBig(`numeric value encoded as ${hexOf(b)} is ${b.length} bytes which exceeds the max allowed of ${maxBytes}`);
  }
  if (b.length === 0) return 0n;
  const last = b[b.length - 1]!;
  let mag = BigInt(last & 0x7f);
  for (let i = b.length - 2; i >= 0; i--) mag = (mag << 8n) | BigInt(b[i]!);
  return (last & 0x80) !== 0 ? -mag : mag;
}

/** serialize_i64(n, None): minimal encoding. */
export function encodeScriptNum(n: bigint): Uint8Array {
  return serializeI64(n, undefined);
}

/** serialize_i64(from, size) (`data_stack.rs:127-162`). */
function serializeI64(n: bigint, size: number | undefined): Uint8Array {
  const negative = n < 0n;
  let positive = negative ? -n : n;
  const bytes: number[] = [];
  while (positive > 0n) {
    bytes.push(Number(positive & 0xffn));
    positive >>= 8n;
  }
  if (bytes.length > 0 && (bytes[bytes.length - 1]! & 0x80) !== 0) bytes.push(0);
  if (size !== undefined) {
    if (bytes.length > size) throw err("SCRIPT_SERIALIZATION", `number ${n} cannot be serialized in ${size} bytes`);
    while (bytes.length < size) bytes.push(0);
  }
  if (negative) bytes[bytes.length - 1]! |= 0x80;
  return Uint8Array.from(bytes);
}

/** Bool of a stack item: false for all zero bytes and for negative zero (`data_stack.rs:229-238`). */
export function isTruthy(b: Uint8Array): boolean {
  for (let i = 0; i < b.length; i++) {
    const v = i === b.length - 1 ? b[i]! & 0x7f : b[i]!;
    if (v !== 0) return true;
  }
  return false;
}

/** serialize_i64(num, Some(size)) as OpNum2Bin uses it (size 0..8). */
export function num2bin(num: bigint, size: number): Uint8Array {
  if (!Number.isInteger(size) || size < 0 || size > 8) throw err("SCRIPT_NOT_MINIMAL_DATA", `push encoding is not minimal: NUM2BIN target size ${size} exceeds 8 bytes`);
  return serializeI64(num, size);
}

// ── Stack (data_stack.rs) ──────────────────────────────────────────────────

class Stack {
  items: Uint8Array[] = [];
  private pushed = 0;

  get length(): number {
    return this.items.length;
  }

  takePushedBytes(): number {
    const p = this.pushed;
    this.pushed = 0;
    return p;
  }

  clone(): Stack {
    const s = new Stack();
    s.items = this.items.slice();
    return s;
  }

  clear(): void {
    this.items = [];
  }

  push(item: Uint8Array): void {
    if (item.length > MAX_SCRIPT_ELEMENT_SIZE) throw elementTooBig(item.length, MAX_SCRIPT_ELEMENT_SIZE);
    this.pushed += item.length;
    this.items.push(item);
  }

  pushUnmetered(item: Uint8Array): void {
    if (item.length > MAX_SCRIPT_ELEMENT_SIZE) throw elementTooBig(item.length, MAX_SCRIPT_ELEMENT_SIZE);
    this.items.push(item);
  }

  pushNumber(n: bigint): void {
    if (n < I64_MIN || n > I64_MAX) throw numberTooBig(`${n} exceeds 64-bit signed integer range`);
    const v = serializeI64(n, undefined);
    if (v.length > 8) throw err("SCRIPT_SERIALIZATION", `number ${n} cannot be serialized in 8 bytes`);
    this.push(v);
  }

  pushNumberUnmetered(n: bigint): void {
    this.items.push(serializeI64(n, undefined));
  }

  pushBool(v: boolean): void {
    this.push(v ? Uint8Array.of(1) : new Uint8Array(0));
  }

  insert(index: number, item: Uint8Array): void {
    if (item.length > MAX_SCRIPT_ELEMENT_SIZE) throw elementTooBig(item.length, MAX_SCRIPT_ELEMENT_SIZE);
    this.pushed += item.length;
    this.items.splice(index, 0, item);
  }

  /** Stack::pop: EmptyStack when empty. */
  pop(): Uint8Array {
    const v = this.items.pop();
    if (v === undefined) throw err("SCRIPT_EMPTY_STACK", "attempt to read from empty stack");
    return v;
  }

  /** pop_raw::<N>: the top N items in stack order (deepest first). */
  popRaw(n: number): Uint8Array[] {
    if (this.items.length < n) throw invalidStackOperation(n, this.items.length);
    return this.items.splice(this.items.length - n, n);
  }

  peekRaw(n: number): Uint8Array[] {
    if (this.items.length < n) throw invalidStackOperation(n, this.items.length);
    return this.items.slice(this.items.length - n);
  }

  popI64s(n: number): bigint[] {
    return this.popRaw(n).map((v) => decodeScriptNum(v, 8));
  }

  popI32s(n: number): bigint[] {
    return this.popI64s(n).map((v) => {
      if (v < I32_MIN || v > I32_MAX) throw numberTooBig(`out of range integral type conversion attempted (${v})`);
      return v;
    });
  }

  popBool(): boolean {
    return isTruthy(this.popRaw(1)[0]!);
  }

  popHash(): string {
    const [v] = this.popRaw(1);
    if (v!.length !== 32) throw err("SCRIPT_INVALID_LENGTH_OF_BLOCK_HASH", `blockhash must be exactly 32 bytes long, got ${v!.length} bytes instead`);
    return hexOf(v!);
  }

  dropItems(n: number): void {
    if (this.items.length < n) throw invalidStackOperation(n, this.items.length);
    this.items.length -= n;
  }

  dupItems(n: number): void {
    if (this.items.length < n) throw invalidStackOperation(n, this.items.length);
    const copy = this.items.slice(this.items.length - n);
    for (const c of copy) this.pushed += c.length;
    this.items.push(...copy);
  }

  overItems(n: number): void {
    if (this.items.length < 2 * n) throw invalidStackOperation(2 * n, this.items.length);
    const copy = this.items.slice(this.items.length - 2 * n, this.items.length - n);
    for (const c of copy) this.pushed += c.length;
    this.items.push(...copy);
  }

  rotItems(n: number): void {
    if (this.items.length < 3 * n) throw invalidStackOperation(3 * n, this.items.length);
    const frame = this.items.splice(this.items.length - 3 * n, 3 * n);
    this.items.push(...frame.slice(n), ...frame.slice(0, n));
  }

  swapItems(n: number): void {
    if (this.items.length < 2 * n) throw invalidStackOperation(2 * n, this.items.length);
    const frame = this.items.splice(this.items.length - 2 * n, 2 * n);
    this.items.push(...frame.slice(n), ...frame.slice(0, n));
  }

  roll(loc: number): void {
    if (loc >= this.items.length) throw invalidStackOperation(loc, this.items.length);
    if (loc === 0) return;
    const [item] = this.items.splice(this.items.length - loc - 1, 1);
    this.items.push(item!);
  }
}

// ── Parsing (opcodes/macros.rs) ────────────────────────────────────────────

interface ParsedOpcode {
  readonly op: number;
  readonly data: Uint8Array;
  readonly next: number;
}

function parseOpcode(script: Uint8Array, pc: number): ParsedOpcode {
  const op = script[pc]!;
  let p = pc + 1;
  if (op >= 0x01 && op <= 0x4b) {
    const available = Math.min(op, script.length - p);
    if (available < op) throw err("SCRIPT_MALFORMED_PUSH", `opcode requires ${op} bytes, but script only has ${available} remaining`);
    return { op, data: script.subarray(p, p + op), next: p + op };
  }
  if (op === Op.PushData1 || op === Op.PushData2 || op === Op.PushData4) {
    const width = op === Op.PushData1 ? 1 : op === Op.PushData2 ? 2 : 4;
    if (script.length - p < width) {
      throw err("SCRIPT_MALFORMED_PUSH_SIZE", `invalid opcode length: [${Array.from(script.subarray(p)).map((b) => b.toString(16).padStart(2, "0")).join(", ")}]`);
    }
    let len = 0;
    for (let i = width - 1; i >= 0; i--) len = len * 256 + script[p + i]!;
    p += width;
    const available = Math.min(len, script.length - p);
    if (available < len) throw err("SCRIPT_MALFORMED_PUSH", `opcode requires ${len} bytes, but script only has ${available} remaining`);
    return { op, data: script.subarray(p, p + len), next: p + len };
  }
  return { op, data: new Uint8Array(0), next: p };
}

const isPushOpcode = (op: number) => op <= NO_COST_OPCODE;
const isConditionalOpcode = (op: number) => op >= Op.If && op <= Op.EndIf;

const P2SH_SPK = (spk: Uint8Array) => spk.length === 35 && spk[0] === Op.Blake2b && spk[1] === Op.Data32 && spk[34] === Op.Equal;

// ── Engine ─────────────────────────────────────────────────────────────────

/** OpCond (`opcodes/mod.rs:35-50`). */
const Cond = { False: 0, True: 1, Skip: 2 } as const;
type Cond = (typeof Cond)[keyof typeof Cond];

class TxScriptEngine {
  dstack = new Stack();
  astack = new Stack();
  condStack: Cond[] = [];
  numOps = 0;
  usedSigOps = 0;
  private remaining: bigint;
  private readonly limit: bigint;
  private readonly sigopUnits: bigint;
  private readonly covenants: CovenantsContext;
  private readonly utxos: ReadonlyArray<ScriptUtxoEntry | undefined>;

  constructor(private readonly ctx: ScriptExecutionContext) {
    this.limit = ctx.scriptUnitsLimit ?? U64_MAX;
    this.remaining = this.limit;
    this.sigopUnits = ctx.sigopScriptUnits ?? DEFAULT_SIGOP_SCRIPT_UNITS;
    this.covenants = ctx.covenants ?? EMPTY_COVENANTS_CONTEXT;
    this.utxos =
      ctx.utxos ??
      ctx.tx.inputs.map((_, i) =>
        i === ctx.inputIndex
          ? { amount: ctx.utxo.amount, scriptPublicKey: ctx.utxo.scriptPublicKey, blockDaaScore: 0n, isCoinbase: false }
          : undefined
      );
  }

  get usedScriptUnits(): bigint {
    return this.limit - this.remaining;
  }

  consume(units: bigint): void {
    if (units > this.remaining) {
      const overflow = units - this.remaining;
      const used = this.limit + overflow > U64_MAX ? U64_MAX : this.limit + overflow;
      throw err("SCRIPT_EXCEEDED_SCRIPT_UNITS", `script units exceeded the amount committed in the input: used=${used}, limit=${this.limit}`);
    }
    this.remaining -= units;
  }

  consumeSigOp(): void {
    this.consume(this.sigopUnits);
    this.usedSigOps += 1;
  }

  isExecuting(): boolean {
    return this.condStack.length === 0 || this.condStack[this.condStack.length - 1] === Cond.True;
  }

  private get input() {
    return this.ctx.tx.inputs[this.ctx.inputIndex]!;
  }

  private utxoAt(idx: bigint, negativeIsIndexError: boolean): ScriptUtxoEntry {
    if (idx < 0n) {
      if (negativeIsIndexError) throw err("SCRIPT_INVALID_INDEX", `${idx} cannot be used as an array index`);
      throw invalidInputIndex(idx, this.ctx.tx.inputs.length);
    }
    const u = idx < BigInt(this.ctx.tx.inputs.length) ? this.utxos[Number(idx)] : undefined;
    if (!u) throw invalidInputIndex(idx, this.ctx.tx.inputs.length);
    return u;
  }

  private signatureScriptOf(idx: number): string {
    const fromCtx = this.ctx.signatureScripts?.[idx];
    if (fromCtx !== undefined) return fromCtx;
    const input = this.ctx.tx.inputs[idx] as { readonly signatureScript?: string | undefined } | undefined;
    return input?.signatureScript ?? "";
  }

  private inputAt(idx: bigint) {
    if (idx < 0n) throw err("SCRIPT_INVALID_INDEX", `${idx} cannot be used as an array index`);
    const i = idx < BigInt(this.ctx.tx.inputs.length) ? this.ctx.tx.inputs[Number(idx)] : undefined;
    if (!i) throw invalidInputIndex(idx, this.ctx.tx.inputs.length);
    return i;
  }

  private outputAt(idx: bigint, negativeIsIndexError: boolean) {
    if (idx < 0n) {
      if (negativeIsIndexError) throw err("SCRIPT_INVALID_INDEX", `${idx} cannot be used as an array index`);
      throw invalidOutputIndex(idx, this.ctx.tx.outputs.length);
    }
    const o = idx < BigInt(this.ctx.tx.outputs.length) ? this.ctx.tx.outputs[Number(idx)] : undefined;
    if (!o) throw invalidOutputIndex(idx, this.ctx.tx.outputs.length);
    return o;
  }

  private static usizes(values: bigint[]): number[] {
    return values.map((v) => {
      if (v < 0n) throw err("SCRIPT_INVALID_INDEX", `${v} cannot be used as an array index`);
      return Number(v);
    });
  }

  private static substring(data: Uint8Array, start: number, end: number): Uint8Array {
    if (end < start) throw err("SCRIPT_INVALID_RANGE", `${start}..${end} is not a valid range, ${end} must be greater than ${start}`);
    if (end - start > MAX_SCRIPT_ELEMENT_SIZE) throw elementTooBig(end - start, MAX_SCRIPT_ELEMENT_SIZE);
    if (end > data.length) throw err("SCRIPT_OUT_OF_BOUNDS_SUBSTRING", `substring [${start}:${end}] is out of bounds for string of length ${data.length}`);
    return data.slice(start, end);
  }

  private covenantsCall<T>(f: () => T): T {
    try {
      return f();
    } catch (e) {
      if (e instanceof CovenantsError) throw err("SCRIPT_COVENANTS_ERROR", e.message);
      throw e;
    }
  }

  // ── Signatures (lib.rs:760-904) ──

  private checkSchnorrWithMsg(key: Uint8Array, sig: Uint8Array, msg: () => Uint8Array): boolean {
    this.consumeSigOp();
    if (key.length !== 32) throw err("SCRIPT_INVALID_PUBKEY", "pubkey invalid: malformed public key");
    try {
      secp256k1.ProjectivePoint.fromHex(`02${hexOf(key)}`);
    } catch {
      throw err("SCRIPT_INVALID_PUBKEY", "pubkey invalid: malformed public key");
    }
    if (sig.length !== 64) throw err("SCRIPT_INVALID_SIGNATURE", "signature invalid: malformed signature");
    try {
      return schnorr.verify(sig, msg(), key);
    } catch {
      return false;
    }
  }

  private checkEcdsaWithMsg(key: Uint8Array, sig: Uint8Array, msg: () => Uint8Array): boolean {
    this.consumeSigOp();
    if (key.length !== 33) throw err("SCRIPT_PUBKEY_FORMAT", "unsupported public key type");
    try {
      secp256k1.ProjectivePoint.fromHex(hexOf(key));
    } catch {
      throw err("SCRIPT_INVALID_PUBKEY", "pubkey invalid: malformed public key");
    }
    if (sig.length !== 64) throw err("SCRIPT_INVALID_SIGNATURE", "signature invalid: malformed signature");
    const r = BigInt(`0x${hexOf(sig.subarray(0, 32))}`);
    const s = BigInt(`0x${hexOf(sig.subarray(32, 64))}`);
    if (r >= SECP256K1_N || s >= SECP256K1_N) throw err("SCRIPT_INVALID_SIGNATURE", "signature invalid: malformed signature");
    if (r === 0n || s === 0n) return false;
    try {
      return secp256k1.verify(secp256k1.Signature.fromCompact(sig), msg(), key, { lowS: true, prehash: false });
    } catch {
      return false;
    }
  }

  private schnorrSighash(hashType: number): Uint8Array {
    return calcKaspaSchnorrSignatureHash(this.ctx.tx, this.ctx.inputIndex, this.ctx.utxo, hashType);
  }

  private ecdsaSighash(hashType: number): Uint8Array {
    return sha256(concat(ECDSA_DOMAIN_HASH, this.schnorrSighash(hashType)));
  }

  private hashTypeOf(typ: number): number {
    if (!ALLOWED_SIGHASH_TYPES.has(typ)) throw err("SCRIPT_INVALID_SIGHASH_TYPE", `invalid hash type 0x${typ.toString(16).padStart(2, "0")}`);
    return typ;
  }

  private opCheckSig(ecdsa: boolean): void {
    const [sigWithType, key] = this.dstack.popRaw(2);
    if (sigWithType!.length === 0) {
      this.dstack.pushBool(false);
      return;
    }
    const hashType = this.hashTypeOf(sigWithType![sigWithType!.length - 1]!);
    const sig = sigWithType!.subarray(0, sigWithType!.length - 1);
    const valid = ecdsa
      ? this.checkEcdsaWithMsg(key!, sig, () => this.ecdsaSighash(hashType))
      : this.checkSchnorrWithMsg(key!, sig, () => this.schnorrSighash(hashType));
    this.dstack.pushBool(valid);
  }

  private opCheckMultiSig(ecdsa: boolean): void {
    const [numKeysBig] = this.dstack.popI32s(1);
    const numKeys = Number(numKeysBig);
    if (numKeys < 0) throw err("SCRIPT_INVALID_PUBKEY_COUNT", `invalid pubkey count: number of pubkeys ${numKeys} is negative`);
    if (numKeys > MAX_PUB_KEYS_PER_MULTISIG) throw err("SCRIPT_INVALID_PUBKEY_COUNT", `invalid pubkey count: too many pubkeys ${numKeys} > ${MAX_PUB_KEYS_PER_MULTISIG}`);
    this.numOps += numKeys;
    if (this.numOps > MAX_OPS_PER_SCRIPT) throw err("SCRIPT_TOO_MANY_OPERATIONS", `exceeded max operation limit of ${MAX_OPS_PER_SCRIPT}`);
    if (this.dstack.length < numKeys) throw invalidStackOperation(numKeys, this.dstack.length);
    const pubKeys = this.dstack.items.splice(this.dstack.length - numKeys, numKeys);
    const [numSigsBig] = this.dstack.popI32s(1);
    const numSigs = Number(numSigsBig);
    if (numSigs < 0) throw err("SCRIPT_INVALID_SIGNATURE_COUNT", `invalid signature count: number of signatures ${numSigs} is negative`);
    if (numSigs > numKeys) throw err("SCRIPT_INVALID_SIGNATURE_COUNT", `invalid signature count: more signatures than pubkeys ${numSigs} > ${numKeys}`);
    if (this.dstack.length < numSigs) throw invalidStackOperation(numSigs, this.dstack.length);
    const signatures = this.dstack.items.splice(this.dstack.length - numSigs, numSigs);

    let failed = false;
    let keyIdx = 0;
    outer: for (let sigIdx = 0; sigIdx < signatures.length; sigIdx++) {
      const signature = signatures[sigIdx]!;
      if (signature.length === 0) {
        failed = true;
        break;
      }
      const hashType = this.hashTypeOf(signature[signature.length - 1]!);
      const sig = signature.subarray(0, signature.length - 1);
      for (;;) {
        if (pubKeys.length - keyIdx < numSigs - sigIdx) {
          failed = true;
          break outer;
        }
        const key = pubKeys[keyIdx++]!;
        const valid = ecdsa
          ? this.checkEcdsaWithMsg(key, sig, () => this.ecdsaSighash(hashType))
          : this.checkSchnorrWithMsg(key, sig, () => this.schnorrSighash(hashType));
        if (valid) break;
      }
    }
    if (failed && signatures.some((s) => s.length > 0)) throw err("SCRIPT_NULL_FAIL", "not all signatures empty on failed checkmultisig");
    this.dstack.pushBool(!failed);
  }

  // ── Script driver (lib.rs:577-749) ──

  executeOpcode(op: number, data: Uint8Array): void {
    if (!isPushOpcode(op)) {
      this.numOps += 1;
      if (this.numOps > MAX_OPS_PER_SCRIPT) throw err("SCRIPT_TOO_MANY_OPERATIONS", `exceeded max operation limit of ${MAX_OPS_PER_SCRIPT}`);
    } else if (data.length > MAX_SCRIPT_ELEMENT_SIZE) {
      throw elementTooBig(data.length, MAX_SCRIPT_ELEMENT_SIZE);
    }
    if (this.isExecuting() || isConditionalOpcode(op)) {
      this.run(op, data);
      const pushed = this.dstack.takePushedBytes() + this.astack.takePushedBytes();
      this.consume(BigInt(pushed));
    }
  }

  executeScript(script: Uint8Array, verifyOnlyPush: boolean): void {
    try {
      let pc = 0;
      while (pc < script.length) {
        const { op, data, next } = parseOpcode(script, pc);
        pc = next;
        if (DISABLED_OPCODES.has(op)) throw err("SCRIPT_OPCODE_DISABLED", `attempt to execute disabled opcode ${opcodeName(op)} (0x${op.toString(16)})`);
        if (ALWAYS_ILLEGAL_OPCODES.has(op)) throw err("SCRIPT_OPCODE_RESERVED", `attempt to execute reserved opcode ${opcodeName(op)} (0x${op.toString(16)})`);
        if (verifyOnlyPush && !isPushOpcode(op)) throw err("SCRIPT_SIGNATURE_SCRIPT_NOT_PUSH_ONLY", "signature script is not push only");
        this.executeOpcode(op, data);
        const combined = this.astack.length + this.dstack.length;
        if (combined > MAX_STACK_SIZE) throw err("SCRIPT_STACK_SIZE_EXCEEDED", `combined stack size ${combined} > max allowed ${MAX_STACK_SIZE}`);
      }
      if (this.condStack.length > 0) throw err("SCRIPT_UNBALANCED_CONDITIONAL", "end of script reached in conditional execution");
    } finally {
      this.astack.clear();
      this.numOps = 0;
    }
  }

  checkErrorCondition(finalScript: boolean): void {
    if (finalScript) {
      if (this.dstack.length > 1) throw err("SCRIPT_CLEAN_STACK", `stack contains ${this.dstack.length - 1} unexpected items`);
      if (this.dstack.length === 0) throw err("SCRIPT_EMPTY_STACK", "attempt to read from empty stack");
    }
    if (!this.dstack.popBool()) throw err("SCRIPT_EVAL_FALSE", "false stack entry at end of script execution");
  }

  /** execute(): returns false when the script public key's version is unknown (accepted without execution). */
  execute(signatureScript: Uint8Array, scriptPublicKey: Uint8Array): void {
    if (this.ctx.utxo.scriptPublicKey.version > MAX_SCRIPT_PUBLIC_KEY_VERSION) return;
    const excess = Math.max(0, scriptPublicKey.length - STANDARD_SCRIPT_PUBLIC_KEY_MAX_SIZE);
    this.consume(BigInt(excess) * SCRIPT_UNITS_PER_GRAM);

    const scripts = [signatureScript, scriptPublicKey];
    if (scripts.every((s) => s.length === 0)) throw err("SCRIPT_EVAL_FALSE", "false stack entry at end of script execution");
    const tooBig = scripts.find((s) => s.length > MAX_SCRIPTS_SIZE);
    if (tooBig) throw err("SCRIPT_SIZE", `script of size ${tooBig.length} exceeded maximum allowed size of ${MAX_SCRIPTS_SIZE}`);

    const isP2sh = P2SH_SPK(scriptPublicKey);
    let saved: Stack | undefined;
    for (let idx = 0; idx < scripts.length; idx++) {
      const s = scripts[idx]!;
      if (s.length === 0) continue;
      if (isP2sh && idx === 1) saved = this.dstack.clone();
      this.executeScript(s, idx === 0);
    }
    if (isP2sh) {
      this.checkErrorCondition(false);
      if (!saved) throw err("SCRIPT_EMPTY_STACK", "attempt to read from empty stack");
      this.dstack = saved;
      const redeem = this.dstack.pop();
      this.executeScript(redeem, false);
    }
    this.checkErrorCondition(true);
  }

  // ── Opcodes (opcodes/mod.rs:247-1515) ──

  private run(op: number, data: Uint8Array): void {
    const d = this.dstack;
    const tx = this.ctx.tx;

    if (op === Op.False) return d.pushUnmetered(new Uint8Array(0));
    if (op >= 0x01 && op <= Op.PushData4) return d.pushUnmetered(Uint8Array.from(data));
    if (op === Op.OneNegate) return d.pushNumberUnmetered(-1n);
    if (op === Op.Reserved) throw err("SCRIPT_OPCODE_RESERVED", `attempt to execute reserved opcode ${opcodeName(op)} (0x${op.toString(16)})`);
    if (op >= Op.True && op <= Op.Op16) return d.pushNumberUnmetered(BigInt(op - 0x50));

    switch (op) {
      // Control
      case Op.Nop:
        return;
      case Op.Ver:
      case Op.Reserved1:
      case Op.Reserved2:
        throw err("SCRIPT_OPCODE_RESERVED", `attempt to execute reserved opcode ${opcodeName(op)} (0x${op.toString(16)})`);
      case Op.If:
      case Op.NotIf: {
        let cond: Cond = Cond.Skip;
        if (this.isExecuting()) {
          const v = d.popBool();
          cond = (op === Op.If ? v : !v) ? Cond.True : Cond.False;
        }
        this.condStack.push(cond);
        return;
      }
      case Op.Else: {
        if (this.condStack.length === 0) throw invalidState("condition stack empty");
        const last = this.condStack[this.condStack.length - 1]!;
        this.condStack[this.condStack.length - 1] = last === Cond.True ? Cond.False : last === Cond.False ? Cond.True : Cond.Skip;
        return;
      }
      case Op.EndIf:
        if (this.condStack.length === 0) throw invalidState("condition stack empty");
        this.condStack.pop();
        return;
      case Op.Verify:
        if (!d.popBool()) throw err("SCRIPT_VERIFY_FAILED", "script ran, but verification failed");
        return;
      case Op.Return:
        throw err("SCRIPT_EARLY_RETURN", "script returned early");

      // Stack
      case Op.ToAltStack: {
        const [item] = d.popRaw(1);
        this.astack.pushUnmetered(item!);
        return;
      }
      case Op.FromAltStack:
        return d.pushUnmetered(this.astack.pop());
      case Op.TwoDrop:
        return d.dropItems(2);
      case Op.TwoDup:
        return d.dupItems(2);
      case Op.ThreeDup:
        return d.dupItems(3);
      case Op.TwoOver:
        return d.overItems(2);
      case Op.TwoRot:
        return d.rotItems(2);
      case Op.TwoSwap:
        return d.swapItems(2);
      case Op.IfDup: {
        const [top] = d.peekRaw(1);
        if (isTruthy(top!)) d.push(top!);
        return;
      }
      case Op.Depth:
        return d.pushNumber(BigInt(d.length));
      case Op.Drop:
        return d.dropItems(1);
      case Op.Dup:
        return d.dupItems(1);
      case Op.Nip:
        if (d.length < 2) throw invalidStackOperation(2, d.length);
        d.items.splice(d.length - 2, 1);
        return;
      case Op.Over:
        return d.overItems(1);
      case Op.Pick: {
        const [loc] = d.popI32s(1);
        if (loc! < 0n || loc! >= BigInt(d.length)) throw invalidState("pick at an invalid location");
        return d.push(d.items[d.length - Number(loc) - 1]!);
      }
      case Op.Roll: {
        const [loc] = d.popI32s(1);
        if (loc! < 0n || loc! >= BigInt(d.length)) throw invalidState("roll at an invalid location");
        return d.roll(Number(loc));
      }
      case Op.Rot:
        return d.rotItems(1);
      case Op.Swap:
        return d.swapItems(1);
      case Op.Tuck:
        if (d.length < 2) throw invalidStackOperation(2, d.length);
        return d.insert(d.length - 2, d.items[d.length - 1]!);

      // Splice
      case Op.Cat: {
        const b = d.pop();
        const a = d.pop();
        return d.push(concat(a, b));
      }
      case Op.Substr: {
        const [start, end] = TxScriptEngine.usizes(d.popI32s(2));
        const dataItem = d.pop();
        return d.push(TxScriptEngine.substring(dataItem, start!, end!));
      }
      case Op.Size: {
        if (d.length === 0) throw invalidStackOperation(1, 0);
        return d.pushNumber(BigInt(d.items[d.length - 1]!.length));
      }

      // Bitwise
      case Op.Invert: {
        const v = d.pop();
        return d.push(v.map((b) => ~b & 0xff));
      }
      case Op.And:
      case Op.Or:
      case Op.Xor: {
        const b = d.pop();
        const a = d.pop();
        const name = op === Op.And ? "AND" : op === Op.Or ? "OR" : "XOR";
        if (a.length !== b.length) throw invalidState(`${name} operands must be of equal length`);
        return d.push(a.map((x, i) => (op === Op.And ? x & b[i]! : op === Op.Or ? x | b[i]! : x ^ b[i]!)));
      }
      case Op.Equal: {
        if (d.length < 2) throw invalidStackOperation(2, d.length);
        const [a, b] = d.popRaw(2);
        return d.push(bytesEqual(a!, b!) ? Uint8Array.of(1) : new Uint8Array(0));
      }
      case Op.EqualVerify: {
        if (d.length < 2) throw invalidStackOperation(2, d.length);
        const [a, b] = d.popRaw(2);
        if (!bytesEqual(a!, b!)) throw err("SCRIPT_VERIFY_FAILED", "script ran, but verification failed");
        return;
      }

      // Numeric
      case Op.OneAdd: {
        const [v] = d.popI64s(1);
        if (v! + 1n > I64_MAX) throw numberTooBig("Result of addition exceeds 64-bit signed integer range");
        return d.pushNumber(v! + 1n);
      }
      case Op.OneSub: {
        const [v] = d.popI64s(1);
        if (v! - 1n < I64_MIN) throw numberTooBig("Result of subtraction exceeds 64-bit signed integer range");
        return d.pushNumber(v! - 1n);
      }
      case Op.Negate: {
        const [v] = d.popI64s(1);
        if (-v! > I64_MAX) throw numberTooBig("Negation result exceeds 64-bit signed integer range");
        return d.pushNumber(-v!);
      }
      case Op.Abs: {
        const [v] = d.popI64s(1);
        const r = v! < 0n ? -v! : v!;
        if (r > I64_MAX) throw numberTooBig("Absolute value exceeds 64-bit signed integer range");
        return d.pushNumber(r);
      }
      case Op.Not: {
        const [v] = d.popI64s(1);
        return d.pushNumber(v === 0n ? 1n : 0n);
      }
      case Op.ZeroNotEqual: {
        const [v] = d.popI64s(1);
        return d.pushNumber(v !== 0n ? 1n : 0n);
      }
      case Op.Add:
      case Op.Sub:
      case Op.Mul: {
        const [a, b] = d.popI64s(2);
        const r = op === Op.Add ? a! + b! : op === Op.Sub ? a! - b! : a! * b!;
        if (r < I64_MIN || r > I64_MAX) {
          throw numberTooBig(op === Op.Add ? "Sum exceeds 64-bit signed integer range" : op === Op.Sub ? "Difference exceeds 64-bit signed integer range" : "Product exceeds 64-bit signed integer range");
        }
        return d.pushNumber(r);
      }
      case Op.Div: {
        const [a, b] = d.popI64s(2);
        if (b === 0n || (a === I64_MIN && b === -1n)) throw invalidState("Quotient exceeds 64-bit signed integer range, or there was a division by zero");
        return d.pushNumber(a! / b!);
      }
      case Op.Mod: {
        const [a, b] = d.popI64s(2);
        if (b === 0n || (a === I64_MIN && b === -1n)) throw invalidState("Illegal modulo by zero");
        return d.pushNumber(a! % b!);
      }
      case Op.BoolAnd: {
        const [a, b] = d.popI64s(2);
        return d.pushNumber(a !== 0n && b !== 0n ? 1n : 0n);
      }
      case Op.BoolOr: {
        const [a, b] = d.popI64s(2);
        return d.pushNumber(a !== 0n || b !== 0n ? 1n : 0n);
      }
      case Op.NumEqual: {
        const [a, b] = d.popI64s(2);
        return d.pushNumber(a === b ? 1n : 0n);
      }
      case Op.NumEqualVerify: {
        const [a, b] = d.popI64s(2);
        if (a !== b) throw err("SCRIPT_VERIFY_FAILED", "script ran, but verification failed");
        return;
      }
      case Op.NumNotEqual: {
        const [a, b] = d.popI64s(2);
        return d.pushNumber(a !== b ? 1n : 0n);
      }
      case Op.LessThan:
      case Op.GreaterThan:
      case Op.LessThanOrEqual:
      case Op.GreaterThanOrEqual: {
        const [a, b] = d.popI64s(2);
        const r = op === Op.LessThan ? a! < b! : op === Op.GreaterThan ? a! > b! : op === Op.LessThanOrEqual ? a! <= b! : a! >= b!;
        return d.pushNumber(r ? 1n : 0n);
      }
      case Op.Min:
      case Op.Max: {
        const [a, b] = d.popI64s(2);
        return d.pushNumber(op === Op.Min ? (a! < b! ? a! : b!) : a! > b! ? a! : b!);
      }
      case Op.Within: {
        const [x, l, u] = d.popI64s(3);
        return d.pushNumber(x! >= l! && x! < u! ? 1n : 0n);
      }

      // Crypto
      case Op.Blake2bWithKey: {
        const [dataItem, key] = d.popRaw(2);
        if (key!.length > 64) throw elementTooBig(key!.length, 64);
        this.consume(BigInt(dataItem!.length) * 2n);
        return d.push(key!.length > 0 ? blake2b(dataItem!, { dkLen: 32, key: key! }) : blake2b(dataItem!, { dkLen: 32 }));
      }
      case Op.SHA256: {
        const [v] = d.popRaw(1);
        this.consume(BigInt(v!.length));
        return d.push(sha256(v!));
      }
      case Op.CheckMultiSigECDSA:
        return this.opCheckMultiSig(true);
      case Op.Blake2b: {
        const [v] = d.popRaw(1);
        this.consume(BigInt(v!.length) * 2n);
        return d.push(blake2b(v!, { dkLen: 32 }));
      }
      case Op.CheckSigECDSA:
        return this.opCheckSig(true);
      case Op.CheckSig:
        return this.opCheckSig(false);
      case Op.CheckSigVerify:
        this.opCheckSig(false);
        if (!d.popBool()) throw err("SCRIPT_VERIFY_FAILED", "script ran, but verification failed");
        return;
      case Op.CheckMultiSig:
        return this.opCheckMultiSig(false);
      case Op.CheckMultiSigVerify:
        this.opCheckMultiSig(false);
        if (!d.popBool()) throw err("SCRIPT_VERIFY_FAILED", "script ran, but verification failed");
        return;

      // Timelocks (opcodes/mod.rs:874-965)
      case Op.CheckLockTimeVerify: {
        const [raw] = d.popRaw(1);
        if (raw!.length > 8) throw numberTooBig(`lockTime value represented as ${hexOf(raw!)} is longer then 8 bytes`);
        const stackLockTime = readU64Le(raw!);
        const txLockTime = BigInt.asUintN(64, tx.lockTime);
        const sameType =
          (txLockTime < LOCK_TIME_THRESHOLD && stackLockTime < LOCK_TIME_THRESHOLD) ||
          (txLockTime >= LOCK_TIME_THRESHOLD && stackLockTime >= LOCK_TIME_THRESHOLD);
        if (!sameType) throw unsatisfiedLockTime(`mismatched locktime types -- tx locktime ${txLockTime}, stack locktime ${stackLockTime}`);
        if (stackLockTime > txLockTime) {
          throw unsatisfiedLockTime(`locktime requirement not satisfied -- locktime is greater than the transaction locktime: ${stackLockTime} > ${txLockTime}`);
        }
        if (BigInt.asUintN(64, this.input.sequence) === MAX_TX_IN_SEQUENCE_NUM) throw unsatisfiedLockTime("transaction input is finalized");
        return;
      }
      case Op.CheckSequenceVerify: {
        const [raw] = d.popRaw(1);
        if (raw!.length > 8) throw numberTooBig(`lockTime value represented as ${hexOf(raw!)} is longer then 8 bytes`);
        const stackSequence = readU64Le(raw!);
        if ((stackSequence & SEQUENCE_LOCK_TIME_DISABLED) !== 0n) return;
        const inputSequence = BigInt.asUintN(64, this.input.sequence);
        if ((inputSequence & SEQUENCE_LOCK_TIME_DISABLED) !== 0n) {
          throw unsatisfiedLockTime(`transaction sequence has sequence locktime disabled bit set: 0x${inputSequence.toString(16)}`);
        }
        if ((stackSequence & SEQUENCE_LOCK_TIME_MASK) > (inputSequence & SEQUENCE_LOCK_TIME_MASK)) {
          throw unsatisfiedLockTime(
            `locktime requirement not satisfied -- locktime is greater than the transaction locktime: ${stackSequence & SEQUENCE_LOCK_TIME_MASK} > ${inputSequence & SEQUENCE_LOCK_TIME_MASK}`
          );
        }
        return;
      }

      // Introspection: transaction
      case Op.TxVersion:
        return d.pushNumber(BigInt(tx.version));
      case Op.TxInputCount:
        return d.pushNumber(BigInt(tx.inputs.length));
      case Op.TxOutputCount:
        return d.pushNumber(BigInt(tx.outputs.length));
      case Op.TxLockTime:
        return d.pushNumber(BigInt.asIntN(64, tx.lockTime));
      case Op.TxSubnetId:
        return d.push(hexToBytes(tx.subnetworkId));
      case Op.TxGas:
        return d.pushNumber(BigInt.asIntN(64, tx.gas));
      case Op.TxPayloadSubstr: {
        const [start, end] = TxScriptEngine.usizes(d.popI32s(2));
        return d.push(TxScriptEngine.substring(hexToBytes(tx.payload), start!, end!));
      }
      case Op.TxPayloadLen:
        return d.pushNumber(BigInt(hexToBytes(tx.payload).length));

      // Introspection: inputs
      case Op.TxInputIndex:
        return d.pushNumber(BigInt(this.ctx.inputIndex));
      case Op.OutpointTxId: {
        const [idx] = d.popI32s(1);
        return d.push(hexToBytes(this.inputAt(idx!).transactionId));
      }
      case Op.OutpointIndex: {
        const [idx] = d.popI32s(1);
        return d.pushNumber(BigInt(this.inputAt(idx!).index));
      }
      case Op.TxInputScriptSigSubstr: {
        const [idx, start, end] = TxScriptEngine.usizes(d.popI32s(3));
        this.inputAt(BigInt(idx!));
        return d.push(TxScriptEngine.substring(hexToBytes(this.signatureScriptOf(idx!)), start!, end!));
      }
      case Op.TxInputSeq: {
        const [idx] = d.popI32s(1);
        return d.push(u64Le(this.inputAt(idx!).sequence));
      }
      case Op.TxInputScriptSigLen: {
        const [idx] = d.popI32s(1);
        this.inputAt(idx!);
        return d.pushNumber(BigInt(hexToBytes(this.signatureScriptOf(Number(idx))).length));
      }

      // Introspection: spent UTXOs
      case Op.TxInputAmount: {
        const [idx] = d.popI32s(1);
        const u = this.utxoAt(idx!, false);
        if (u.amount > I64_MAX) throw numberTooBig("out of range integral type conversion attempted");
        return d.pushNumber(u.amount);
      }
      case Op.TxInputSpk: {
        const [idx] = d.popI32s(1);
        return d.push(spkToBytes(this.utxoAt(idx!, false).scriptPublicKey));
      }
      case Op.TxInputDaaScore: {
        const [idx] = d.popI32s(1);
        return d.pushNumber(BigInt.asIntN(64, this.utxoAt(idx!, true).blockDaaScore));
      }
      case Op.TxInputIsCoinbase: {
        const [idx] = d.popI32s(1);
        return d.pushNumber(this.utxoAt(idx!, true).isCoinbase ? 1n : 0n);
      }
      case Op.TxInputSpkLen: {
        const [idx] = d.popI32s(1);
        return d.pushNumber(BigInt(spkToBytes(this.utxoAt(idx!, true).scriptPublicKey).length));
      }
      case Op.TxInputSpkSubstr: {
        const [idx, start, end] = TxScriptEngine.usizes(d.popI32s(3));
        const spk = spkToBytes(this.utxoAt(BigInt(idx!), true).scriptPublicKey);
        return d.push(TxScriptEngine.substring(spk, start!, end!));
      }
      case Op.InputCovenantId: {
        const [idx] = d.popI32s(1);
        const u = this.utxoAt(idx!, true);
        return d.push(hexToBytes(u.covenantId ?? ZERO_HASH_HEX));
      }

      // Introspection: outputs
      case Op.TxOutputAmount: {
        const [idx] = d.popI32s(1);
        const o = this.outputAt(idx!, false);
        if (o.value > I64_MAX) throw numberTooBig("out of range integral type conversion attempted");
        return d.pushNumber(o.value);
      }
      case Op.TxOutputSpk: {
        const [idx] = d.popI32s(1);
        return d.push(spkToBytes(this.outputAt(idx!, false).scriptPublicKey));
      }
      case Op.TxOutputSpkLen: {
        const [idx] = d.popI32s(1);
        return d.pushNumber(BigInt(spkToBytes(this.outputAt(idx!, true).scriptPublicKey).length));
      }
      case Op.TxOutputSpkSubstr: {
        const [idx, start, end] = TxScriptEngine.usizes(d.popI32s(3));
        const spk = spkToBytes(this.outputAt(BigInt(idx!), true).scriptPublicKey);
        return d.push(TxScriptEngine.substring(spk, start!, end!));
      }
      case Op.OutputCovenantId: {
        const [idx] = d.popI32s(1);
        const o = this.outputAt(idx!, true);
        return d.push(hexToBytes(o.covenant?.covenantId ?? ZERO_HASH_HEX));
      }
      case Op.OutputAuthorizingInput: {
        const [idx] = d.popI32s(1);
        const o = this.outputAt(idx!, true);
        return d.pushNumber(o.covenant ? BigInt(o.covenant.authorizingInput) : -1n);
      }

      // Covenants (covenants.rs)
      case Op.AuthOutputCount: {
        const [inputIdx] = TxScriptEngine.usizes(d.popI32s(1));
        if (inputIdx! >= tx.inputs.length) throw invalidInputIndex(inputIdx!, tx.inputs.length);
        return d.pushNumber(BigInt(numAuthOutputs(this.covenants, inputIdx!)));
      }
      case Op.AuthOutputIdx: {
        const [inputIdx, k] = TxScriptEngine.usizes(d.popI32s(2));
        if (inputIdx! >= tx.inputs.length) throw invalidInputIndex(inputIdx!, tx.inputs.length);
        const outIdx = this.covenantsCall(() => authOutputIndex(this.covenants, inputIdx!, k!));
        return d.pushNumber(BigInt(outIdx));
      }
      case Op.CovInputCount: {
        const id = d.popHash();
        return d.pushNumber(BigInt(numCovenantInputs(this.covenants, id)));
      }
      case Op.CovInputIdx: {
        const [k] = TxScriptEngine.usizes(d.popI32s(1));
        const id = d.popHash();
        return d.pushNumber(BigInt(this.covenantsCall(() => covenantInputIndex(this.covenants, id, k!))));
      }
      case Op.CovOutputCount: {
        const id = d.popHash();
        return d.pushNumber(BigInt(numCovenantOutputs(this.covenants, id)));
      }
      case Op.CovOutputIdx: {
        const [k] = TxScriptEngine.usizes(d.popI32s(1));
        const id = d.popHash();
        return d.pushNumber(BigInt(this.covenantsCall(() => covenantOutputIndex(this.covenants, id, k!))));
      }

      // Numeric encoding
      case Op.Num2Bin: {
        const [size] = TxScriptEngine.usizes(d.popI32s(1));
        if (size! > 8) throw err("SCRIPT_NOT_MINIMAL_DATA", `push encoding is not minimal: NUM2BIN target size ${size} exceeds 8 bytes`);
        const [num] = d.popI64s(1);
        return d.push(serializeI64(num!, size!));
      }
      case Op.Bin2Num: {
        const [num] = d.popI64s(1);
        return d.pushNumber(num!);
      }

      // Signatures from the stack
      case Op.CheckSigFromStack:
      case Op.CheckSigFromStackECDSA: {
        const [signature, msgHash, pubkey] = d.popRaw(3);
        if (msgHash!.length !== 32) throw invalidState("message hash must be 32 bytes");
        const valid =
          op === Op.CheckSigFromStack
            ? this.checkSchnorrWithMsg(pubkey!, signature!, () => msgHash!)
            : this.checkEcdsaWithMsg(pubkey!, signature!, () => msgHash!);
        return d.pushBool(valid);
      }

      case Op.Blake3: {
        const [v] = d.popRaw(1);
        this.consume(BigInt(v!.length));
        return d.push(blake3(v!, { dkLen: 32 }));
      }
      case Op.Blake3WithKey: {
        const [dataItem, key] = d.popRaw(2);
        if (key!.length !== 32) throw err("SCRIPT_MALFORMED_PUSH", `opcode requires 32 bytes, but script only has ${key!.length} remaining`);
        this.consume(BigInt(dataItem!.length));
        return d.push(blake3(dataItem!, { dkLen: 32, key: key! }));
      }
    }

    if (UNSUPPORTED_OPCODES.has(op)) {
      throw err("SCRIPT_UNSUPPORTED_OPCODE", `${opcodeName(op)} (0x${op.toString(16)}) is enabled by rusty-kaspa v2.1.0 but not reproduced by the simulator`);
    }
    throw err("SCRIPT_INVALID_OPCODE", `attempt to execute invalid opcode ${opcodeName(op)} (0x${op.toString(16)})`);
  }
}

function readU64Le(raw: Uint8Array): bigint {
  let v = 0n;
  for (let i = raw.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(raw[i]!);
  return v;
}

// ── Script VM ────────────────────────────────────────────────────────────────

export class ScriptVM {
  /**
   * Runs one transaction input: `signatureScript` against the script public key it spends, as
   * `TxScriptEngine::from_transaction_input(...).execute()` does. Never throws.
   */
  public static execute(
    signatureScript: Uint8Array,
    scriptPublicKey: Uint8Array,
    context: ScriptExecutionContext
  ): ScriptExecutionResult {
    let engine: TxScriptEngine | undefined;
    try {
      engine = new TxScriptEngine(context);
      engine.execute(signatureScript, scriptPublicKey);
      return { success: true, stack: engine.dstack.items, usedScriptUnits: engine.usedScriptUnits, usedSigOps: engine.usedSigOps };
    } catch (e: any) {
      const scriptError: ScriptError = e instanceof ScriptError ? e : err("SCRIPT_INTERNAL_ERROR", String(e?.message ?? e));
      return {
        success: false,
        error: scriptError.message,
        code: scriptError.code,
        stack: engine?.dstack.items ?? [],
        ...(engine ? { usedScriptUnits: engine.usedScriptUnits, usedSigOps: engine.usedSigOps } : {})
      };
    }
  }
}
