import { blake2b } from "@noble/hashes/blake2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { schnorr, secp256k1 } from "@noble/curves/secp256k1";

/*
 * The Kaspa signature hash of a transaction input (rusty-kaspa v2.1.0 consensus/core/src/hashing/sighash.rs,
 * calc_schnorr_signature_hash), ported for one use: checking, before a transaction is finalized, a Schnorr signature
 * another party made for one of its inputs. kaspa-wasm signs inputs but exposes neither the hash nor a verifier. Checked
 * against the upstream test vectors (core/test/kaspa-sighash.test.ts) and against kaspa-wasm's own signatures
 * (accounts/test/v1-draft.test.ts, simulator/test/differential-wasm.test.ts).
 * A v1 transaction commits to its outputs' covenant bindings and not to its inputs' compute budgets; a v0 transaction
 * commits to its inputs' sig op counts.
 */

export const SIGHASH_ALL = 0x01;
export const SIGHASH_NONE = 0x02;
export const SIGHASH_SINGLE = 0x04;
export const SIGHASH_ANYONE_CAN_PAY = 0x80;
const SIGHASH_MASK = 0x07;
const ALLOWED_SIGHASH_TYPES = new Set([0x01, 0x02, 0x04, 0x81, 0x82, 0x84]);

export interface KaspaSighashScript {
  readonly version: number;
  /** hex */
  readonly script: string;
}

export interface KaspaSighashTransaction {
  readonly version: number;
  readonly inputs: ReadonlyArray<{ readonly transactionId: string; readonly index: number; readonly sequence: bigint; readonly sigOpCount?: number | undefined }>;
  readonly outputs: ReadonlyArray<{
    readonly value: bigint;
    readonly scriptPublicKey: KaspaSighashScript;
    readonly covenant?: { readonly authorizingInput: number; readonly covenantId: string } | undefined;
  }>;
  readonly lockTime: bigint;
  /** 20 bytes, hex */
  readonly subnetworkId: string;
  readonly gas: bigint;
  /** hex */
  readonly payload: string;
}

/** The output an input spends, as the node lists it. */
export interface KaspaSighashUtxo {
  readonly amount: bigint;
  readonly scriptPublicKey: KaspaSighashScript;
}

const ZERO_HASH = new Uint8Array(32);

function hex(s: string, what: string): Uint8Array {
  if (typeof s !== "string" || !/^(?:[0-9a-f]{2})*$/i.test(s)) throw sighashError(`${what} is not hex`);
  return Uint8Array.from(Buffer.from(s, "hex"));
}

function sighashError(message: string): Error {
  const err = new Error(`KASPA_SIGHASH_INPUT_INVALID: ${message}`);
  (err as any).code = "KASPA_SIGHASH_INPUT_INVALID";
  return err;
}

/**
 * A rusty-kaspa blake2b_hasher (blake2b-256 keyed with its domain: TransactionSigningHash by default, CovenantID, …) and
 * the HasherExtensions writes (little endian).
 */
export class KaspaHasher {
  private readonly h: ReturnType<typeof blake2b.create>;
  constructor(domain = "TransactionSigningHash") {
    this.h = blake2b.create({ dkLen: 32, key: new TextEncoder().encode(domain) });
  }
  bytes(b: Uint8Array): this {
    this.h.update(b);
    return this;
  }
  u8(n: number): this {
    return this.bytes(Uint8Array.of(n & 0xff));
  }
  u16(n: number): this {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, n, true);
    return this.bytes(b);
  }
  u32(n: number): this {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    return this.bytes(b);
  }
  u64(n: bigint): this {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigUint64(0, BigInt.asUintN(64, n), true);
    return this.bytes(b);
  }
  bool(v: boolean): this {
    return this.u8(v ? 1 : 0);
  }
  varBytes(b: Uint8Array): this {
    return this.u64(BigInt(b.length)).bytes(b);
  }
  digest(): Uint8Array {
    return this.h.digest();
  }
}

const isAnyoneCanPay = (t: number) => (t & SIGHASH_ANYONE_CAN_PAY) === SIGHASH_ANYONE_CAN_PAY;
const isNone = (t: number) => (t & SIGHASH_MASK) === SIGHASH_NONE;
const isSingle = (t: number) => (t & SIGHASH_MASK) === SIGHASH_SINGLE;

function hashScript(h: KaspaHasher, spk: KaspaSighashScript): void {
  h.u16(spk.version).varBytes(hex(spk.script, "script public key"));
}

function hashOutput(h: KaspaHasher, o: KaspaSighashTransaction["outputs"][number], version: number): void {
  h.u64(o.value);
  hashScript(h, o.scriptPublicKey);
  if (version >= 1) {
    h.bool(o.covenant !== undefined);
    if (o.covenant) h.u16(o.covenant.authorizingInput).bytes(hex(o.covenant.covenantId, "covenant id"));
  }
}

function previousOutputsHash(tx: KaspaSighashTransaction, t: number): Uint8Array {
  if (isAnyoneCanPay(t)) return ZERO_HASH;
  const h = new KaspaHasher();
  for (const i of tx.inputs) h.bytes(hex(i.transactionId, "outpoint transaction id")).u32(i.index);
  return h.digest();
}

function sequencesHash(tx: KaspaSighashTransaction, t: number): Uint8Array {
  if (isSingle(t) || isAnyoneCanPay(t) || isNone(t)) return ZERO_HASH;
  const h = new KaspaHasher();
  for (const i of tx.inputs) h.u64(i.sequence);
  return h.digest();
}

function sigOpCountsHash(tx: KaspaSighashTransaction, t: number): Uint8Array {
  if (isAnyoneCanPay(t)) return ZERO_HASH;
  const h = new KaspaHasher();
  for (const i of tx.inputs) h.u8(i.sigOpCount ?? 0);
  return h.digest();
}

function payloadHash(tx: KaspaSighashTransaction): Uint8Array {
  const payload = hex(tx.payload, "payload");
  if (/^0*$/.test(tx.subnetworkId) && payload.length === 0) return ZERO_HASH;
  return new KaspaHasher().varBytes(payload).digest();
}

function outputsHash(tx: KaspaSighashTransaction, t: number, inputIndex: number): Uint8Array {
  if (isNone(t)) return ZERO_HASH;
  if (isSingle(t)) {
    if (inputIndex >= tx.outputs.length) return ZERO_HASH;
    const h = new KaspaHasher();
    hashOutput(h, tx.outputs[inputIndex]!, tx.version);
    return h.digest();
  }
  const h = new KaspaHasher();
  for (const o of tx.outputs) hashOutput(h, o, tx.version);
  return h.digest();
}

/** calc_schnorr_signature_hash: the 32-byte message a Schnorr signature of input `inputIndex` signs. */
export function kaspaSchnorrSignatureHash(tx: KaspaSighashTransaction, inputIndex: number, utxo: KaspaSighashUtxo, hashType: number = SIGHASH_ALL): Uint8Array {
  if (!ALLOWED_SIGHASH_TYPES.has(hashType)) throw sighashError(`sighash type ${hashType} is not one consensus allows`);
  const input = tx.inputs[inputIndex];
  if (!input) throw sighashError(`no input ${inputIndex}`);
  const subnetwork = hex(tx.subnetworkId, "subnetwork id");
  if (subnetwork.length !== 20) throw sighashError("a subnetwork id is 20 bytes");
  const h = new KaspaHasher().u16(tx.version).bytes(previousOutputsHash(tx, hashType)).bytes(sequencesHash(tx, hashType));
  if (tx.version < 1) h.bytes(sigOpCountsHash(tx, hashType));
  h.bytes(hex(input.transactionId, "outpoint transaction id")).u32(input.index);
  hashScript(h, utxo.scriptPublicKey);
  h.u64(utxo.amount).u64(input.sequence);
  if (tx.version < 1) h.u8(input.sigOpCount ?? 0);
  return h.bytes(outputsHash(tx, hashType, inputIndex)).u64(tx.lockTime).bytes(subnetwork).u64(tx.gas).bytes(payloadHash(tx)).u8(hashType).digest();
}

// ---------------------------------------------------------------------------------------------------------------------
// ECDSA P2PK inputs (script `21 <33-byte compressed key> ab`, OP_CHECKSIGECDSA). kaspa-wasm 2.1.0 signs Schnorr only and
// exposes just the ECDSA hasher (TransactionSigningHashECDSA), so the ECDSA signature is made here with @noble/curves
// (audited; RFC 6979 deterministic nonces, low-S), over the hash rusty-kaspa v2.1.0 verifies:
// calc_ecdsa_signature_hash = SHA-256(SHA-256("TransactionSigningHashECDSA") ‖ calc_schnorr_signature_hash), checked
// against kaspa-wasm's TransactionSigningHashECDSA (core/test/kaspa-sighash-ecdsa.test.ts). The node verifies it with
// libsecp256k1 (Signature::from_compact, verify_ecdsa: a high-S signature does not verify).
// ---------------------------------------------------------------------------------------------------------------------

const ECDSA_DOMAIN = sha256(new TextEncoder().encode("TransactionSigningHashECDSA"));
/** secp256k1 group order n, and n / 2 (a signature's s above it is high-S). */
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP256K1_HALF_N = SECP256K1_N >> 1n;

/** calc_ecdsa_signature_hash: the 32-byte message an ECDSA signature of input `inputIndex` signs. */
export function kaspaEcdsaSignatureHash(tx: KaspaSighashTransaction, inputIndex: number, utxo: KaspaSighashUtxo, hashType: number = SIGHASH_ALL): Uint8Array {
  const schnorrHash = kaspaSchnorrSignatureHash(tx, inputIndex, utxo, hashType);
  const preimage = new Uint8Array(ECDSA_DOMAIN.length + schnorrHash.length);
  preimage.set(ECDSA_DOMAIN, 0);
  preimage.set(schnorrHash, ECDSA_DOMAIN.length);
  return sha256(preimage);
}

/** The 33-byte compressed public key (hex) of a 32-byte private key (hex): what an ECDSA P2PK script commits to. */
export function ecdsaCompressedPublicKey(privateKeyHex: string): string {
  if (typeof privateKeyHex !== "string" || !/^[0-9a-f]{64}$/i.test(privateKeyHex)) throw sighashError("an ECDSA private key is 32 bytes (64 hex)");
  return Buffer.from(secp256k1.getPublicKey(Uint8Array.from(Buffer.from(privateKeyHex, "hex")), true)).toString("hex");
}

/**
 * The ECDSA signature of input `inputIndex` (65 bytes hex: the 64-byte compact signature r ‖ s, low-S, and the sighash
 * type), deterministic (RFC 6979: the same transaction and key give the same signature). The private key is used here
 * only and never appears in an error.
 */
export function signKaspaInputEcdsa(input: {
  readonly tx: KaspaSighashTransaction;
  readonly inputIndex: number;
  readonly utxo: KaspaSighashUtxo;
  readonly privateKey: string;
  readonly hashType?: number | undefined;
}): string {
  const hashType = input.hashType ?? SIGHASH_ALL;
  if (typeof input.privateKey !== "string" || !/^[0-9a-f]{64}$/i.test(input.privateKey)) throw sighashError("an ECDSA private key is 32 bytes (64 hex)");
  const msg = kaspaEcdsaSignatureHash(input.tx, input.inputIndex, input.utxo, hashType);
  const sig = secp256k1.sign(msg, Uint8Array.from(Buffer.from(input.privateKey, "hex")), { lowS: true, prehash: false });
  if (sig.s > SECP256K1_HALF_N) throw sighashError("the signature is not low-S");
  return Buffer.from(sig.toCompactRawBytes()).toString("hex") + hashType.toString(16).padStart(2, "0");
}

/**
 * Whether `signature` (65 bytes hex: the compact ECDSA signature and its sighash type) is a valid ECDSA signature by
 * the 33-byte compressed `publicKey` of input `inputIndex` of `tx` spending `utxo`, as the node checks it: low-S only (a
 * high-S signature is refused), the sighash type one of `allowedTypes` (default SIGHASH_ALL). Never throws.
 */
export function verifyKaspaInputSignatureEcdsa(input: {
  readonly tx: KaspaSighashTransaction;
  readonly inputIndex: number;
  readonly utxo: KaspaSighashUtxo;
  readonly publicKey: string;
  readonly signature: string;
  readonly allowedTypes?: readonly number[] | undefined;
}): boolean {
  try {
    if (!/^[0-9a-f]{130}$/i.test(input.signature) || !/^(02|03)[0-9a-f]{64}$/i.test(input.publicKey)) return false;
    const sig = Buffer.from(input.signature, "hex");
    const hashType = sig[64]!;
    if (!(input.allowedTypes ?? [SIGHASH_ALL]).includes(hashType)) return false;
    const compact = Uint8Array.from(sig.subarray(0, 64));
    const s = BigInt("0x" + Buffer.from(compact.subarray(32)).toString("hex"));
    if (s === 0n || s > SECP256K1_HALF_N) return false;
    const msg = kaspaEcdsaSignatureHash(input.tx, input.inputIndex, input.utxo, hashType);
    return secp256k1.verify(compact, msg, Uint8Array.from(Buffer.from(input.publicKey, "hex")), { lowS: true, prehash: false });
  } catch {
    return false;
  }
}

/** "vvvvscript" (the version as 2 bytes, then the script, hex) as kaspa-wasm serializes a script public key. */
function scriptOfHex(spk: unknown, what: string): KaspaSighashScript {
  const s = String(spk ?? "");
  if (!/^(?:[0-9a-f]{2}){2,}$/i.test(s)) throw sighashError(`${what} is not a serialized script public key`);
  return { version: parseInt(s.slice(0, 4), 16), script: s.slice(4).toLowerCase() };
}

/**
 * What the signature hash reads, from a kaspa-wasm `Transaction.serializeToObject()`: the transaction, and the output
 * each input spends (`utxo`, when the transaction carries it).
 */
export function kaspaSighashInputsFromWasm(serialized: any): { readonly tx: KaspaSighashTransaction; readonly utxos: ReadonlyArray<KaspaSighashUtxo | undefined> } {
  const big = (v: unknown) => BigInt(String(v ?? 0).replace(/n$/, ""));
  const tx: KaspaSighashTransaction = {
    version: Number(serialized.version),
    inputs: (serialized.inputs as any[]).map((i) => ({
      transactionId: String(i.transactionId),
      index: Number(i.index),
      sequence: big(i.sequence),
      sigOpCount: Number(i.sigOpCount ?? 0)
    })),
    outputs: (serialized.outputs as any[]).map((o, n) => ({
      value: big(o.value),
      scriptPublicKey: scriptOfHex(o.scriptPublicKey, `output ${n}`),
      ...(o.covenant ? { covenant: { authorizingInput: Number(o.covenant.authorizingInput), covenantId: String(o.covenant.covenantId) } } : {})
    })),
    lockTime: big(serialized.lockTime),
    subnetworkId: String(serialized.subnetworkId),
    gas: big(serialized.gas),
    payload: String(serialized.payload ?? "")
  };
  const utxos = (serialized.inputs as any[]).map((i, n) => (i.utxo ? { amount: big(i.utxo.amount), scriptPublicKey: scriptOfHex(i.utxo.scriptPublicKey, `input ${n}'s utxo`) } : undefined));
  return { tx, utxos };
}

/**
 * Whether `signature` (65 bytes hex: the 64-byte Schnorr signature and its sighash type, as an input's signature script
 * or a contract's `sig` argument carries it) is a valid BIP340 signature by the x-only `publicKey` of input `inputIndex`
 * of `tx` spending `utxo`. The sighash type must be one of `allowedTypes` (default: SIGHASH_ALL, the only one HardKAS
 * signs with). Never throws: a malformed signature, key or type is simply not valid.
 */
export function verifyKaspaInputSignature(input: {
  readonly tx: KaspaSighashTransaction;
  readonly inputIndex: number;
  readonly utxo: KaspaSighashUtxo;
  readonly publicKey: string;
  readonly signature: string;
  readonly allowedTypes?: readonly number[] | undefined;
}): boolean {
  try {
    if (!/^[0-9a-f]{130}$/i.test(input.signature) || !/^[0-9a-f]{64}$/i.test(input.publicKey)) return false;
    const sig = Buffer.from(input.signature, "hex");
    const hashType = sig[64]!;
    if (!(input.allowedTypes ?? [SIGHASH_ALL]).includes(hashType)) return false;
    const msg = kaspaSchnorrSignatureHash(input.tx, input.inputIndex, input.utxo, hashType);
    return schnorr.verify(Uint8Array.from(sig.subarray(0, 64)), msg, Uint8Array.from(Buffer.from(input.publicKey, "hex")));
  } catch {
    return false;
  }
}
