import { kcc1Hash, kcc1P2shCommitment, kcc1P2shScriptPublicKeyOfCommitment, kcc1PushExplicit, kcc1PushMinimal, kccBytes, kccHex } from "./kcc1.js";

/**
 * KCC-2 · Authority Schemes (kaspanet/kccs, Final; requires KCC-1 and KIP-20).
 *
 * The scheme registry (one byte: 0x00-0x04 assigned, 0x05-0x7f reserved and refused, 0x80-0xff custom), how each standard
 * scheme's 32-byte authority value is formed, and its minimum approval check. KCC-2 chooses no signed message, signature
 * encoding or replay domain: a signature check is the caller's (`signatureValid`), as the higher-level convention defines
 * it. KCC-2 is not a token standard; KCC-20 is one convention that uses it (for `owner`).
 */

function kccError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

export type Kcc2SchemeName = "p2pk-schnorr/v1" | "p2pkh-schnorr/v1" | "p2pkh-ecdsa/v1" | "p2sh/v1" | "covenant-id/v1";

export interface Kcc2Scheme {
  readonly byte: number;
  readonly name: Kcc2SchemeName;
  /** The KCC-1 type of the authority value (always a 32-byte payload here). */
  readonly valueType: "pubkey" | "byte[32]";
  readonly authority: string;
}

/** §2.1: the canonical byte of each standard scheme. */
export const KCC2_SCHEMES: readonly Kcc2Scheme[] = Object.freeze([
  { byte: 0x00, name: "p2pk-schnorr/v1", valueType: "pubkey", authority: "the 32-byte Schnorr public key itself" },
  { byte: 0x01, name: "p2pkh-schnorr/v1", valueType: "byte[32]", authority: "Hash(pubkey) of a 32-byte Schnorr public key" },
  { byte: 0x02, name: "p2pkh-ecdsa/v1", valueType: "byte[32]", authority: "Hash(ecdsa_pubkey) of a compressed 33-byte ECDSA public key" },
  { byte: 0x03, name: "p2sh/v1", valueType: "byte[32]", authority: "the KCC-1 P2SH commitment Blake2b(R) to one exact redeem script" },
  { byte: 0x04, name: "covenant-id/v1", valueType: "byte[32]", authority: "a KIP-20 Covenant ID: one continuing covenant lineage" }
]);

/**
 * A custom scheme (0x80-0xff) is usable only with its full definition (§2.1): byte, name and version, KCC-1 value type and
 * exact payload length, interpretation, and its approval check.
 */
export interface Kcc2CustomScheme {
  readonly byte: number;
  readonly name: string;
  readonly valueType: string;
  readonly payloadLength: number;
  readonly interpretation: string;
  readonly approve: (authorityValue: Uint8Array, context: unknown) => boolean;
}

export type Kcc2Registry =
  | { readonly kind: "standard"; readonly scheme: Kcc2Scheme }
  | { readonly kind: "reserved" }
  | { readonly kind: "custom"; readonly scheme?: Kcc2CustomScheme | undefined };

/** Where a scheme byte falls in the registry. */
export function kcc2Registry(byte: number, custom: readonly Kcc2CustomScheme[] = []): Kcc2Registry {
  if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) throw kccError("KCC2_SCHEME_INVALID", `${byte} is not a scheme byte`);
  const standard = KCC2_SCHEMES.find((s) => s.byte === byte);
  if (standard) return { kind: "standard", scheme: standard };
  if (byte <= 0x7f) return { kind: "reserved" };
  return { kind: "custom", scheme: custom.find((c) => c.byte === byte) };
}

/** The standard scheme of `byte`; a reserved byte (0x05-0x7f) is refused and never given a local meaning. */
export function kcc2Scheme(byte: number): Kcc2Scheme {
  const r = kcc2Registry(byte);
  if (r.kind === "standard") return r.scheme;
  if (r.kind === "reserved") throw kccError("KCC2_SCHEME_RESERVED", `0x${byte.toString(16).padStart(2, "0")} is reserved for a future standard scheme`);
  throw kccError("KCC2_SCHEME_CUSTOM_UNDEFINED", `0x${byte.toString(16)} is a custom scheme: it needs its definition`);
}

const COMPRESSED_ECDSA = (k: Uint8Array) => k.length === 33 && (k[0] === 0x02 || k[0] === 0x03);

/** P2PKH key commitment: unkeyed KCC-1 Hash (BLAKE3) of the raw public key. */
export function kcc2P2pkhHash(publicKey: Uint8Array, scheme: "p2pkh-schnorr/v1" | "p2pkh-ecdsa/v1"): Uint8Array {
  if (scheme === "p2pkh-schnorr/v1" && publicKey.length !== 32) throw kccError("KCC2_VALUE_INVALID", `a p2pkh-schnorr/v1 public key has exactly 32 bytes, got ${publicKey.length}`);
  if (scheme === "p2pkh-ecdsa/v1" && !COMPRESSED_ECDSA(publicKey)) throw kccError("KCC2_VALUE_INVALID", "a p2pkh-ecdsa/v1 public key is a compressed 33-byte key (02 or 03 prefix)");
  return kcc1Hash(publicKey);
}

/** The authority value of a standard scheme, from what it identifies. */
export function kcc2AuthorityValue(
  scheme: Kcc2SchemeName,
  material: { readonly publicKey?: string | Uint8Array; readonly redeemScript?: string | Uint8Array; readonly covenantId?: string | Uint8Array }
): Uint8Array {
  switch (scheme) {
    case "p2pk-schnorr/v1": {
      const k = kccBytes(material.publicKey, "publicKey");
      if (k.length !== 32) throw kccError("KCC2_VALUE_INVALID", "a p2pk-schnorr/v1 authority is a 32-byte public key");
      return k;
    }
    case "p2pkh-schnorr/v1":
    case "p2pkh-ecdsa/v1":
      return kcc2P2pkhHash(kccBytes(material.publicKey, "publicKey"), scheme);
    case "p2sh/v1":
      return kcc1P2shCommitment(kccBytes(material.redeemScript, "redeemScript"));
    case "covenant-id/v1": {
      const id = kccBytes(material.covenantId, "covenantId");
      if (id.length !== 32) throw kccError("KCC2_VALUE_INVALID", "a Covenant ID has 32 bytes");
      return id;
    }
  }
}

/** The value's KCC-1 encodings (no scheme byte): as an argument (PushMinimal) and as a state field (PushExplicit). */
export function kcc2Encodings(authorityValue: Uint8Array): { argument: Uint8Array; state: Uint8Array } {
  if (authorityValue.length !== 32) throw kccError("KCC2_VALUE_INVALID", "a standard authority value has exactly 32 bytes");
  return { argument: kcc1PushMinimal(authorityValue), state: kcc1PushExplicit(authorityValue) };
}

/** What a minimum approval check looks at (§2.2, §2.3). */
export interface Kcc2ApprovalContext {
  /** Signature schemes: the public key revealed (p2pkh) or used (p2pk) for verification. */
  readonly publicKey?: string | Uint8Array | undefined;
  /** Signature schemes: the result of verifying the signature under that key, with the convention's message and encoding. */
  readonly signatureValid?: boolean | undefined;
  /** p2sh/v1: the spent inputs' authenticated script public keys. */
  readonly inputScriptPublicKeys?: readonly { readonly version: number; readonly script: string }[] | undefined;
  /** p2sh/v1: an input-index witness, when the convention uses one: it must be in range and select the matching input. */
  readonly inputIndex?: number | undefined;
  /** covenant-id/v1: the spent inputs' authenticated Covenant IDs (null without a binding). Outputs never count. */
  readonly inputCovenantIds?: readonly (string | null)[] | undefined;
}

export interface Kcc2Approval {
  readonly approved: boolean;
  readonly reason: string;
}

/**
 * The minimum approval check of a scheme for an authority value. A pass is the minimum KCC-2 requires, never an
 * application's whole authorization: the convention adds its message, witness and any further conditions (§2.4, §6).
 */
export function kcc2CheckApproval(schemeByte: number, authorityValue: string | Uint8Array, context: Kcc2ApprovalContext, custom: readonly Kcc2CustomScheme[] = []): Kcc2Approval {
  const value = kccBytes(authorityValue, "authority value");
  const reg = kcc2Registry(schemeByte, custom);
  if (reg.kind === "reserved") throw kccError("KCC2_SCHEME_RESERVED", `0x${schemeByte.toString(16).padStart(2, "0")} is reserved`);
  if (reg.kind === "custom") {
    if (!reg.scheme) throw kccError("KCC2_SCHEME_CUSTOM_UNDEFINED", `custom scheme 0x${schemeByte.toString(16)} has no definition here`);
    if (value.length !== reg.scheme.payloadLength) return { approved: false, reason: `the ${reg.scheme.name} value has ${reg.scheme.payloadLength} bytes` };
    return reg.scheme.approve(value, context) ? { approved: true, reason: reg.scheme.name } : { approved: false, reason: `${reg.scheme.name} not approved` };
  }
  if (value.length !== 32) return { approved: false, reason: `a ${reg.scheme.name} authority value has 32 bytes, got ${value.length}` };
  const hex = kccHex(value);
  switch (reg.scheme.name) {
    case "p2pk-schnorr/v1": {
      const key = context.publicKey === undefined ? undefined : kccBytes(context.publicKey, "publicKey");
      if (!key || key.length !== 32) return { approved: false, reason: "no 32-byte public key" };
      if (kccHex(key) !== hex) return { approved: false, reason: "the key is not the authority's public key" };
      return context.signatureValid === true ? { approved: true, reason: "valid signature by the authority key" } : { approved: false, reason: "no valid signature" };
    }
    case "p2pkh-schnorr/v1":
    case "p2pkh-ecdsa/v1": {
      const key = context.publicKey === undefined ? undefined : kccBytes(context.publicKey, "publicKey");
      const shapeOk = reg.scheme.name === "p2pkh-schnorr/v1" ? key?.length === 32 : !!key && COMPRESSED_ECDSA(key);
      if (!key || !shapeOk) return { approved: false, reason: reg.scheme.name === "p2pkh-schnorr/v1" ? "the revealed key is not 32 bytes" : "the revealed key is not a compressed 33-byte ECDSA key" };
      if (kccHex(kcc1Hash(key)) !== hex) return { approved: false, reason: "Hash(revealed key) is not the authority value" };
      return context.signatureValid === true ? { approved: true, reason: "revealed key matches and its signature is valid" } : { approved: false, reason: "no valid signature" };
    }
    case "p2sh/v1": {
      const expected = kcc1P2shScriptPublicKeyOfCommitment(value);
      const spks = context.inputScriptPublicKeys ?? [];
      const matches = (i: number) => spks[i] !== undefined && spks[i]!.version === expected.version && spks[i]!.script.toLowerCase() === expected.scriptHex;
      if (context.inputIndex !== undefined) {
        if (!Number.isInteger(context.inputIndex) || context.inputIndex < 0 || context.inputIndex >= spks.length) return { approved: false, reason: `input index ${context.inputIndex} is out of range` };
        return matches(context.inputIndex) ? { approved: true, reason: `input ${context.inputIndex} is the P2SH authority` } : { approved: false, reason: `input ${context.inputIndex} is not the version-0 P2SH envelope of the authority` };
      }
      const i = spks.findIndex((_, k) => matches(k));
      return i >= 0 ? { approved: true, reason: `input ${i} is the P2SH authority` } : { approved: false, reason: "no spent input is the version-0 P2SH envelope of the authority" };
    }
    case "covenant-id/v1": {
      const i = (context.inputCovenantIds ?? []).findIndex((c) => typeof c === "string" && c.toLowerCase() === hex);
      return i >= 0 ? { approved: true, reason: `input ${i} belongs to the lineage` } : { approved: false, reason: "no spent input belongs to the authority's lineage (outputs do not count)" };
    }
  }
}
