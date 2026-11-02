import {
  KCC_SOURCE,
  kcc1DecodeArguments,
  kcc1DecodeInt8,
  kcc1DecodeState,
  kcc1EncodeArguments,
  kcc1EncodeState,
  kcc1FunctionSignature,
  kcc1DispatchTagOfSignature,
  kcc1Hash,
  kcc1ParseSignatureScript,
  kcc1ParseType,
  kcc1PushMinimal,
  kcc1SignatureScript,
  kcc1SplitProgram,
  kcc1TemplateView,
  kccBytes,
  kccHex,
  type Kcc1Field,
  type Kcc1Record,
  type Kcc1Records,
  type Kcc1ScriptPublicKey,
  type Kcc1Type,
  type Kcc1View
} from "./kcc1.js";
import { kcc2CheckApproval, kcc2Registry } from "./kcc2.js";
import type { SilAbiArtifact, SilTypeArtifact } from "./silverscript.js";

/**
 * KCC-20 · Fungible Token Covenant Specification (kaspanet/kccs, Final; requires KCC-1, KCC-2, KIP-20).
 *
 * A fungible token held in L1 covenant UTXOs: the KCC20State record, the `transfer` / `transfer_delegator` interface with
 * its witness layouts, borrowed receive with its four borrow schemes, extension commitments, and the program artifact's
 * configuration. This module is the off-chain side a wallet, indexer or test needs: exact codecs, witness builders and
 * parsers, and `kcc20CheckTransfer`, a model of the leader's rules (conservation, token identity by extension commitment,
 * ownership, authorization, borrowed receive) checked against the official vectors.
 *
 * What it is not: the covenant program itself (that is the token's own compiled program, and consensus runs it), a
 * signature verifier (KCC-20 fixes no sighash: `signatureValid` is the caller's check), nor KRC-20. KRC-20 (Kasplex) is a
 * different, inscription-based token protocol interpreted by off-chain indexers; KCC-20 tokens are covenant UTXOs whose
 * rules the covenant program enforces on L1.
 */

function kccError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

const t = (s: string): Kcc1Type => kcc1ParseType(s);

/** §1: the KCC20State record, fields in order. */
export const KCC20_STATE_RECORD: Kcc1Record = Object.freeze({
  name: "KCC20State",
  fields: Object.freeze([
    { name: "amount", type: t("int") },
    { name: "owner", type: t("byte[32]") },
    { name: "owner_scheme", type: t("byte") },
    { name: "borrow_scheme", type: t("byte") },
    { name: "borrow_guard", type: t("byte[32]") },
    { name: "extension_commitment", type: t("byte[32]") }
  ])
});
export const KCC20_RECORDS: Kcc1Records = Object.freeze({ KCC20State: KCC20_STATE_RECORD });
/** The 112 bytes of EncodeState(KCC20State). */
export const KCC20_ENCODED_STATE_LENGTH = 112;

export interface Kcc20State {
  /** Token base units; a valid state holds a non-negative amount. */
  readonly amount: bigint;
  /** 32 bytes, hex: the owner's authority value under `ownerScheme` (KCC-2). */
  readonly owner: string;
  /** A KCC-2 scheme byte. */
  readonly ownerScheme: number;
  /** A KCC-20 borrow scheme byte (0-3 assigned). */
  readonly borrowScheme: number;
  /** 32 bytes, hex. */
  readonly borrowGuard: string;
  /** 32 bytes, hex: the digest of the extended state; equal commitments are fungible with one another. */
  readonly extensionCommitment: string;
}

/** §5: the borrow-scheme selectors (fixed). */
export const KCC20_BORROW_SCHEMES = Object.freeze([
  { byte: 0x00, name: "disabled/v1" },
  { byte: 0x01, name: "amount-threshold/v1" },
  { byte: 0x02, name: "schnorr-signature/v1" },
  { byte: 0x03, name: "hash-chain/v1" }
]);

const hex32 = (v: unknown, where: string): string => {
  const b = kccBytes(v, where);
  if (b.length !== 32) throw kccError("KCC20_STATE_INVALID", `${where}: expected 32 bytes, got ${b.length}`);
  return kccHex(b);
};

const byte = (v: unknown, where: string): number => {
  if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 255) throw kccError("KCC20_STATE_INVALID", `${where}: expected a byte`);
  return v as number;
};

/** A Kcc20State with its fields checked for shape (32-byte strings, bytes, a bigint amount); semantic rules are separate. */
export function kcc20State(s: { amount: bigint | number | string; owner: unknown; ownerScheme: number; borrowScheme: number; borrowGuard: unknown; extensionCommitment: unknown }): Kcc20State {
  const amount = typeof s.amount === "bigint" ? s.amount : typeof s.amount === "number" && Number.isSafeInteger(s.amount) ? BigInt(s.amount) : typeof s.amount === "string" && /^-?(0|[1-9][0-9]*)$/.test(s.amount) ? BigInt(s.amount) : undefined;
  if (amount === undefined) throw kccError("KCC20_STATE_INVALID", "amount: expected an exact integer");
  return {
    amount,
    owner: hex32(s.owner, "owner"),
    ownerScheme: byte(s.ownerScheme, "ownerScheme"),
    borrowScheme: byte(s.borrowScheme, "borrowScheme"),
    borrowGuard: hex32(s.borrowGuard, "borrowGuard"),
    extensionCommitment: hex32(s.extensionCommitment, "extensionCommitment")
  };
}

const toRecord = (s: Kcc20State) => ({
  amount: s.amount,
  owner: s.owner,
  owner_scheme: s.ownerScheme,
  borrow_scheme: s.borrowScheme,
  borrow_guard: s.borrowGuard,
  extension_commitment: s.extensionCommitment
});

const fromRecord = (r: any): Kcc20State => ({
  amount: r.amount as bigint,
  owner: r.owner as string,
  ownerScheme: r.owner_scheme as number,
  borrowScheme: r.borrow_scheme as number,
  borrowGuard: r.borrow_guard as string,
  extensionCommitment: r.extension_commitment as string
});

/**
 * EncodeState of one KCC20State (KCC-1 §3.7.1): 112 bytes. I-05: a negative amount is not a KCC-20 state (§1), so it is
 * refused here as by the CLI and the model; an invalid successor for a test is built with the KCC-1 encoders directly.
 */
export function kcc20EncodeState(state: Kcc20State): Uint8Array {
  const s = kcc20State(state);
  if (s.amount < 0n) throw kccError("KCC20_STATE_INVALID", `amount ${s.amount} is negative: a KCC20State amount is non-negative (KCC-20 §1)`);
  return kcc1EncodeState(KCC20_STATE_RECORD.fields, toRecord(s), KCC20_RECORDS);
}

/** Decodes exactly one encoded KCC20State (strict KCC-1 decoding). */
export function kcc20DecodeState(encoded: string | Uint8Array): Kcc20State {
  return fromRecord(kcc1DecodeState(encoded, KCC20_STATE_RECORD.fields, KCC20_RECORDS).state);
}

// ---------------------------------------------------------------------------
// §2, §3 Configuration, entrypoints, program artifact
// ---------------------------------------------------------------------------

export interface Kcc20Config {
  readonly transferEntrypoint: string;
  readonly delegatorEntrypoint: string;
  /** Supported owner schemes, by their canonical KCC-2 bytes. */
  readonly ownerSchemes: readonly number[];
  readonly maxTokenInputs: number;
  readonly maxTokenOutputs: number;
  /** §2 MAY: limit the total input amount of a transfer to 2^63 - 1 (the reference implementation does). */
  readonly limitTotalAmount?: boolean | undefined;
  /** §5 MAY: require the amount-threshold payload to be non-negative (otherwise a negative one behaves as zero). */
  readonly requireNonNegativeThreshold?: boolean | undefined;
}

/** §3: the default configuration. */
export const KCC20_DEFAULT_CONFIG: Kcc20Config = Object.freeze({
  transferEntrypoint: "transfer",
  delegatorEntrypoint: "transfer_delegator",
  ownerSchemes: Object.freeze([0x00, 0x01, 0x02, 0x03, 0x04]),
  maxTokenInputs: 3,
  maxTokenOutputs: 3,
  limitTotalAmount: true,
  requireNonNegativeThreshold: false
});

const TRANSFER_TYPES = ["KCC20State[]", "byte[]"] as const;
const DELEGATOR_TYPES = ["byte[]"] as const;

/** The function signatures and dispatch tags of a configuration's entrypoints (default: 79c71c23 and fd3ef14a). */
export function kcc20Entrypoints(config: Kcc20Config = KCC20_DEFAULT_CONFIG): {
  transfer: { functionSignature: string; dispatchTag: string };
  delegator: { functionSignature: string; dispatchTag: string };
} {
  const transfer = kcc1FunctionSignature(config.transferEntrypoint, [...TRANSFER_TYPES], KCC20_RECORDS);
  const delegator = kcc1FunctionSignature(config.delegatorEntrypoint, [...DELEGATOR_TYPES], KCC20_RECORDS);
  const out = {
    transfer: { functionSignature: transfer, dispatchTag: kcc1DispatchTagOfSignature(transfer) },
    delegator: { functionSignature: delegator, dispatchTag: kcc1DispatchTagOfSignature(delegator) }
  };
  if (out.transfer.dispatchTag === out.delegator.dispatchTag) throw kccError("KCC20_CONFIG_INVALID", "the transfer and delegator entrypoints share a dispatch tag");
  return out;
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A configuration checked against §2-§3: entrypoint names, supported standard owner schemes, positive bounds. */
export function kcc20CheckConfig(config: Kcc20Config): Kcc20Config {
  if (!IDENT.test(config.transferEntrypoint) || !IDENT.test(config.delegatorEntrypoint)) throw kccError("KCC20_CONFIG_INVALID", "entrypoint names must be identifiers");
  if (config.transferEntrypoint === config.delegatorEntrypoint) throw kccError("KCC20_CONFIG_INVALID", "the transfer and delegator entrypoints must differ");
  if (config.ownerSchemes.length === 0) throw kccError("KCC20_CONFIG_INVALID", "at least one owner scheme");
  const seen = new Set<number>();
  for (const s of config.ownerSchemes) {
    const r = kcc2Registry(s);
    if (r.kind !== "standard") throw kccError("KCC20_CONFIG_INVALID", `owner scheme 0x${Number(s).toString(16)} is not a standard KCC-2 scheme (custom schemes need their own witness definition)`);
    if (seen.has(s)) throw kccError("KCC20_CONFIG_INVALID", `owner scheme 0x${s.toString(16)} is listed twice`);
    seen.add(s);
  }
  for (const [k, v] of [["maxTokenInputs", config.maxTokenInputs], ["maxTokenOutputs", config.maxTokenOutputs]] as const) {
    if (!Number.isSafeInteger(v) || v < 1) throw kccError("KCC20_CONFIG_INVALID", `${k} must be a positive integer`);
  }
  kcc20Entrypoints(config);
  return config;
}

/**
 * Reads a KCC-20 program artifact in the reference implementation's form (argent-lang/kcc20-reference `kcc20.json`):
 * `{ program: { artifact }, entrypoints: { transfer, delegator }, owner_schemes, max_token_inputs, max_token_outputs }`.
 * KCC-20 fixes what the artifact must describe, not its serialization; unknown keys are refused rather than ignored.
 */
export function kcc20ParseArtifact(input: unknown): Kcc20Config & { readonly programArtifact?: string | undefined } {
  const o = input as any;
  const obj = (v: unknown, where: string) => {
    if (v === null || typeof v !== "object" || Array.isArray(v)) throw kccError("KCC20_ARTIFACT_INVALID", `${where} is not an object`);
    return v as Record<string, unknown>;
  };
  const only = (v: Record<string, unknown>, keys: string[], where: string) => {
    const extra = Object.keys(v).filter((k) => !keys.includes(k));
    if (extra.length) throw kccError("KCC20_ARTIFACT_INVALID", `${where}: unknown key(s) ${extra.join(", ")}`);
  };
  const root = obj(o, "artifact");
  only(root, ["program", "entrypoints", "owner_schemes", "max_token_inputs", "max_token_outputs"], "artifact");
  let programArtifact: string | undefined;
  if (root.program !== undefined) {
    const p = obj(root.program, "program");
    only(p, ["artifact"], "program");
    if (typeof p.artifact !== "string" || p.artifact === "") throw kccError("KCC20_ARTIFACT_INVALID", "program.artifact must name the program artifact");
    programArtifact = p.artifact;
  }
  const e = obj(root.entrypoints, "entrypoints");
  only(e, ["transfer", "delegator"], "entrypoints");
  if (typeof e.transfer !== "string" || typeof e.delegator !== "string") throw kccError("KCC20_ARTIFACT_INVALID", "entrypoints.transfer and entrypoints.delegator are names");
  if (!Array.isArray(root.owner_schemes) || !root.owner_schemes.every((s) => Number.isInteger(s))) throw kccError("KCC20_ARTIFACT_INVALID", "owner_schemes is an array of scheme bytes");
  const config: Kcc20Config = {
    transferEntrypoint: e.transfer,
    delegatorEntrypoint: e.delegator,
    ownerSchemes: root.owner_schemes as number[],
    maxTokenInputs: root.max_token_inputs as number,
    maxTokenOutputs: root.max_token_outputs as number,
    limitTotalAmount: KCC20_DEFAULT_CONFIG.limitTotalAmount,
    requireNonNegativeThreshold: KCC20_DEFAULT_CONFIG.requireNonNegativeThreshold
  };
  try {
    kcc20CheckConfig(config);
  } catch (err: any) {
    throw kccError("KCC20_ARTIFACT_INVALID", String(err?.message ?? err).replace(/^[A-Z0-9_]+: /, ""));
  }
  return { ...config, ...(programArtifact !== undefined ? { programArtifact } : {}) };
}

// ---------------------------------------------------------------------------
// §2 Witnesses
// ---------------------------------------------------------------------------

/** Owner-authentication data of the default configuration, by owner scheme (§2 table). */
export type Kcc20OwnerAuth =
  | { readonly scheme: 0x00; readonly signature: string }
  | { readonly scheme: 0x01; readonly publicKey: string; readonly signature: string }
  | { readonly scheme: 0x02; readonly publicKey: string; readonly signature: string }
  | { readonly scheme: 0x03; readonly inputIndex: number }
  | { readonly scheme: 0x04 };

/** Borrow-authorization data, by borrow scheme (§5 table). */
export type Kcc20BorrowAuth =
  | { readonly scheme: 0x01 }
  | { readonly scheme: 0x02; readonly signature: string }
  | { readonly scheme: 0x03; readonly revealedGuard: string; readonly oneTimePublicKey: string; readonly signature: string };

const exact = (v: unknown, n: number, where: string): Uint8Array => {
  const b = kccBytes(v, where);
  if (b.length !== n) throw kccError("KCC20_WITNESS_INVALID", `${where}: expected ${n} bytes, got ${b.length}`);
  return b;
};

/** The owner-authentication bytes of a scheme (no path byte). */
export function kcc20OwnerAuthBytes(auth: Kcc20OwnerAuth): Uint8Array {
  switch (auth.scheme) {
    case 0x00:
      return exact(auth.signature, 65, "signature");
    case 0x01:
      return Uint8Array.from([...exact(auth.publicKey, 32, "publicKey"), ...exact(auth.signature, 65, "signature")]);
    case 0x02: {
      const k = exact(auth.publicKey, 33, "publicKey");
      if (k[0] !== 0x02 && k[0] !== 0x03) throw kccError("KCC20_WITNESS_INVALID", "publicKey: a compressed ECDSA key starts with 02 or 03");
      return Uint8Array.from([...k, ...exact(auth.signature, 65, "signature")]);
    }
    case 0x03:
      if (!Number.isInteger(auth.inputIndex) || auth.inputIndex < 0 || auth.inputIndex > 255) throw kccError("KCC20_WITNESS_INVALID", "inputIndex is one unsigned byte");
      return Uint8Array.of(auth.inputIndex);
    case 0x04:
      return new Uint8Array(0);
    default:
      throw kccError("KCC20_WITNESS_INVALID", `owner scheme 0x${(auth as any).scheme?.toString(16)} has no default witness layout`);
  }
}

/** The leader's witness for a normal owner-authorized transfer: `00 || owner-authentication bytes`. */
export const kcc20TransferWitness = (auth: Kcc20OwnerAuth): Uint8Array => Uint8Array.from([0x00, ...kcc20OwnerAuthBytes(auth)]);
/** A delegator's complete witness: its owner-authentication bytes, without a path byte. */
export const kcc20DelegatorWitness = (auth: Kcc20OwnerAuth): Uint8Array => kcc20OwnerAuthBytes(auth);

/** The leader's witness for a borrowed receive: `01 || borrow witness`. */
export function kcc20BorrowWitness(auth: Kcc20BorrowAuth): Uint8Array {
  switch (auth.scheme) {
    case 0x01:
      return Uint8Array.of(0x01);
    case 0x02:
      return Uint8Array.from([0x01, ...exact(auth.signature, 65, "signature")]);
    case 0x03:
      return Uint8Array.from([0x01, ...exact(auth.revealedGuard, 32, "revealedGuard"), ...exact(auth.oneTimePublicKey, 32, "oneTimePublicKey"), ...exact(auth.signature, 65, "signature")]);
    default:
      throw kccError("KCC20_WITNESS_INVALID", `borrow scheme 0x${(auth as any).scheme?.toString(16)} takes no borrow witness`);
  }
}

/** Parses owner-authentication bytes under a scheme; their length must be exactly the scheme's. */
export function kcc20ParseOwnerAuth(bytes: Uint8Array, scheme: number): Kcc20OwnerAuth {
  const need = { 0: 65, 1: 97, 2: 98, 3: 1, 4: 0 }[scheme as 0 | 1 | 2 | 3 | 4];
  if (need === undefined) throw kccError("KCC20_WITNESS_INVALID", `owner scheme 0x${scheme.toString(16)} has no default witness layout`);
  if (bytes.length !== need) throw kccError("KCC20_WITNESS_INVALID", `owner scheme 0x${scheme.toString(16)} takes ${need} witness bytes, got ${bytes.length}`);
  switch (scheme) {
    case 0x00:
      return { scheme: 0x00, signature: kccHex(bytes) };
    case 0x01:
      return { scheme: 0x01, publicKey: kccHex(bytes.slice(0, 32)), signature: kccHex(bytes.slice(32)) };
    case 0x02:
      return { scheme: 0x02, publicKey: kccHex(bytes.slice(0, 33)), signature: kccHex(bytes.slice(33)) };
    case 0x03:
      return { scheme: 0x03, inputIndex: bytes[0]! };
    default:
      return { scheme: 0x04 };
  }
}

/** Parses the borrow witness (`witness[1..]`) under a borrow scheme; exact lengths. */
export function kcc20ParseBorrowAuth(bytes: Uint8Array, scheme: number): Kcc20BorrowAuth {
  if (scheme === 0x01) {
    if (bytes.length !== 0) throw kccError("KCC20_WITNESS_INVALID", "amount-threshold/v1 takes an empty borrow witness");
    return { scheme: 0x01 };
  }
  if (scheme === 0x02) {
    if (bytes.length !== 65) throw kccError("KCC20_WITNESS_INVALID", "schnorr-signature/v1 takes a 65-byte signature");
    return { scheme: 0x02, signature: kccHex(bytes) };
  }
  if (scheme === 0x03) {
    if (bytes.length !== 129) throw kccError("KCC20_WITNESS_INVALID", "hash-chain/v1 takes exactly 129 bytes");
    return { scheme: 0x03, revealedGuard: kccHex(bytes.slice(0, 32)), oneTimePublicKey: kccHex(bytes.slice(32, 64)), signature: kccHex(bytes.slice(64)) };
  }
  throw kccError("KCC20_WITNESS_INVALID", `borrow scheme 0x${scheme.toString(16)} takes no borrow witness`);
}

/** One hash-chain/v1 link: `x_i = Hash(x_(i-1) || pubkey_i)`. */
export function kcc20HashChainLink(previous: string | Uint8Array, oneTimePublicKey: string | Uint8Array): string {
  return kccHex(kcc1Hash(Uint8Array.from([...exact(previous, 32, "previous"), ...exact(oneTimePublicKey, 32, "oneTimePublicKey")])));
}

/** The chain x_1..x_n from x_0 and the one-time public keys; x_n is the initial borrow guard. */
export function kcc20HashChain(x0: string | Uint8Array, oneTimePublicKeys: readonly (string | Uint8Array)[]): string[] {
  const out: string[] = [];
  let prev: string | Uint8Array = x0;
  for (const k of oneTimePublicKeys) {
    prev = kcc20HashChainLink(prev, k);
    out.push(prev);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Invocations
// ---------------------------------------------------------------------------

/** `PushArguments(next_states, witness)` of `transfer` (KCC-1 §3.4.6: one grouped push per KCC20State field). */
export function kcc20TransferArguments(nextStates: readonly Kcc20State[], witness: string | Uint8Array): Uint8Array {
  return kcc1EncodeArguments([...TRANSFER_TYPES], [nextStates.map((s) => toRecord(kcc20State(s))), kccHex(kccBytes(witness, "witness"))], KCC20_RECORDS);
}

/** Decodes `transfer` arguments (strict). */
export function kcc20DecodeTransferArguments(pushArguments: string | Uint8Array): { nextStates: Kcc20State[]; witness: string } {
  const [states, witness] = kcc1DecodeArguments(pushArguments, [...TRANSFER_TYPES], KCC20_RECORDS) as [any[], string];
  return { nextStates: states.map(fromRecord), witness };
}

/** The leader's signature script: transfer arguments, the dispatch tag, then `PushMinimal(R)`. */
export function kcc20TransferSignatureScript(nextStates: readonly Kcc20State[], witness: string | Uint8Array, redeemScript: Uint8Array, config: Kcc20Config = KCC20_DEFAULT_CONFIG): Uint8Array {
  return kcc1SignatureScript(kcc20TransferArguments(nextStates, witness), kcc20Entrypoints(config).transfer.dispatchTag, redeemScript);
}

/** A delegator's signature script: its witness (`byte[]`), the dispatch tag, then `PushMinimal(R)`. */
export function kcc20DelegatorSignatureScript(witness: string | Uint8Array, redeemScript: Uint8Array, config: Kcc20Config = KCC20_DEFAULT_CONFIG): Uint8Array {
  return kcc1SignatureScript(kcc1PushMinimal(kccBytes(witness, "witness")), kcc20Entrypoints(config).delegator.dispatchTag, redeemScript);
}

/** The KCC-20 invocation in a signature script: which entrypoint, its decoded arguments and R. */
export function kcc20ParseInvocation(signatureScript: string | Uint8Array, consumed?: Kcc1ScriptPublicKey, config: Kcc20Config = KCC20_DEFAULT_CONFIG):
  | { entrypoint: "transfer"; nextStates: Kcc20State[]; witness: string; redeemScript: string }
  | { entrypoint: "delegator"; witness: string; redeemScript: string } {
  const inv = kcc1ParseSignatureScript(signatureScript, consumed);
  const tags = kcc20Entrypoints(config);
  if (inv.dispatchTagHex === tags.transfer.dispatchTag) return { entrypoint: "transfer", ...kcc20DecodeTransferArguments(inv.pushArguments), redeemScript: kccHex(inv.redeemScript) };
  if (inv.dispatchTagHex === tags.delegator.dispatchTag) {
    const [witness] = kcc1DecodeArguments(inv.pushArguments, [...DELEGATOR_TYPES]) as [string];
    return { entrypoint: "delegator", witness, redeemScript: kccHex(inv.redeemScript) };
  }
  throw kccError("KCC20_INVOCATION_UNKNOWN", `dispatch tag ${inv.dispatchTagHex} is neither ${tags.transfer.dispatchTag} nor ${tags.delegator.dispatchTag}`);
}

// ---------------------------------------------------------------------------
// §2, §5 The leader's rules, off chain
// ---------------------------------------------------------------------------

export interface Kcc20Verdict {
  readonly accepted: boolean;
  readonly path?: "normal" | "borrowed" | undefined;
  /** The rule that refused it (absent when accepted). */
  readonly rule?: string | undefined;
  readonly reason: string;
}

/** A signature the caller must verify (KCC-20 fixes no signed message or sighash type; the program checks it on chain). */
export interface Kcc20SignatureCheck {
  readonly role: "leader-owner" | "delegate-owner" | "borrow";
  /** Position in the family's inputs (0 is the leader). */
  readonly familyInput: number;
  readonly scheme: string;
  readonly publicKey: string;
  readonly signature: string;
}

export interface Kcc20FamilyInput {
  readonly state: Kcc20State;
  readonly kasValueSompi: bigint;
  /** The input's `witness` argument (hex): the leader's starts with its path byte; a delegator's is its owner auth. */
  readonly witness: string;
}

export interface Kcc20FamilyOutput {
  readonly state: Kcc20State;
  readonly kasValueSompi: bigint;
}

export interface Kcc20Transfer {
  readonly config?: Kcc20Config | undefined;
  /** The family's token inputs (sharing its Covenant ID) in input order: [0] is the leader, the rest are delegators. */
  readonly inputs: readonly Kcc20FamilyInput[];
  /** The leader's `next_states` argument. */
  readonly nextStates: readonly Kcc20State[];
  /** The family's continuation outputs, in output order. */
  readonly outputs: readonly Kcc20FamilyOutput[];
  /** The transaction's spent inputs, for p2sh/v1 and covenant-id/v1 owners (authenticated script public keys and IDs). */
  readonly transactionInputs?: { readonly scriptPublicKeys: readonly { readonly version: number; readonly script: string }[]; readonly covenantIds: readonly (string | null)[] } | undefined;
  readonly signatureValid: (check: Kcc20SignatureCheck) => boolean;
}

const INT_MAX = (1n << 63n) - 1n;
const reject = (rule: string, reason: string, path?: "normal" | "borrowed"): Kcc20Verdict => ({ accepted: false, rule, reason, ...(path ? { path } : {}) });
const sameState = (a: Kcc20State, b: Kcc20State) =>
  a.amount === b.amount && a.owner === b.owner && a.ownerScheme === b.ownerScheme && a.borrowScheme === b.borrowScheme && a.borrowGuard === b.borrowGuard && a.extensionCommitment === b.extensionCommitment;

const KCC20_SCHEME_NAMES: Readonly<Record<number, string>> = { 0: "p2pk-schnorr/v1", 1: "p2pkh-schnorr/v1", 2: "p2pkh-ecdsa/v1", 3: "p2sh/v1", 4: "covenant-id/v1" };

/** KCC-2's minimum check of one owner, from its owner-authentication bytes (default layouts of §2). */
function ownerAuthorized(state: Kcc20State, auth: Uint8Array, role: "leader-owner" | "delegate-owner", familyInput: number, t: Kcc20Transfer, config: Kcc20Config): Kcc20Verdict | undefined {
  if (!config.ownerSchemes.includes(state.ownerScheme)) return reject("owner_scheme", `input ${familyInput}: owner_scheme 0x${state.ownerScheme.toString(16)} is not supported`);
  let parsed: Kcc20OwnerAuth;
  try {
    parsed = kcc20ParseOwnerAuth(auth, state.ownerScheme);
  } catch (e: any) {
    return reject("witness", `input ${familyInput}: ${String(e?.message ?? e).replace(/^[A-Z0-9_]+: /, "")}`);
  }
  const sig = (publicKey: string, signature: string) => t.signatureValid({ role, familyInput, scheme: KCC20_SCHEME_NAMES[state.ownerScheme] ?? `0x${state.ownerScheme.toString(16)}`, publicKey, signature });
  let approval;
  switch (parsed.scheme) {
    case 0x00:
      approval = kcc2CheckApproval(0x00, state.owner, { publicKey: state.owner, signatureValid: sig(state.owner, parsed.signature) });
      break;
    case 0x01:
    case 0x02:
      approval = kcc2CheckApproval(parsed.scheme, state.owner, { publicKey: parsed.publicKey, signatureValid: sig(parsed.publicKey, parsed.signature) });
      break;
    case 0x03:
      if (!t.transactionInputs) return reject("owner", `input ${familyInput}: a p2sh/v1 owner needs the transaction's spent inputs`);
      approval = kcc2CheckApproval(0x03, state.owner, { inputScriptPublicKeys: t.transactionInputs.scriptPublicKeys, inputIndex: parsed.inputIndex });
      break;
    case 0x04:
      if (!t.transactionInputs) return reject("owner", `input ${familyInput}: a covenant-id/v1 owner needs the transaction's spent inputs`);
      approval = kcc2CheckApproval(0x04, state.owner, { inputCovenantIds: t.transactionInputs.covenantIds });
      break;
  }
  return approval.approved ? undefined : reject("owner", `input ${familyInput}: ${approval.reason}`);
}

/**
 * §5 borrowed receive, for the leader (the borrowed input) and `next_states[0]` with its actual output: the borrow
 * scheme's rule (pseudocode of §5), a strictly positive increase above the effective threshold, the borrowed successor
 * preserving owner, owner_scheme, borrow_scheme and extension_commitment with the expected next borrow guard, and no less
 * KAS than the borrowed input.
 */
export function kcc20CheckBorrowedReceive(params: {
  readonly leader: { readonly state: Kcc20State; readonly kasValueSompi: bigint };
  readonly successor: { readonly state: Kcc20State; readonly kasValueSompi: bigint };
  /** `witness[1..]`. */
  readonly borrowWitness: string | Uint8Array;
  readonly config?: Kcc20Config | undefined;
  readonly signatureValid: (check: Kcc20SignatureCheck) => boolean;
}): Kcc20Verdict {
  const config = params.config ?? KCC20_DEFAULT_CONFIG;
  const leader = params.leader.state;
  const next = params.successor.state;
  const witness = kccBytes(params.borrowWitness, "borrow witness");
  let threshold = 0n;
  let nextGuard = leader.borrowGuard;
  switch (leader.borrowScheme) {
    case 0x00:
      return reject("borrow_scheme", "borrow_scheme is disabled/v1", "borrowed");
    case 0x01: {
      if (witness.length !== 0) return reject("witness", "amount-threshold/v1 takes an empty borrow witness", "borrowed");
      const decoded = kcc1DecodeInt8(kccBytes(leader.borrowGuard, "borrow_guard").slice(0, 8), "borrow_guard[0..8]", "zero");
      if (config.requireNonNegativeThreshold && (decoded < 0n || kccBytes(leader.borrowGuard, "g")[7]! & 0x80)) {
        return reject("borrow_guard", "this configuration requires a non-negative threshold payload", "borrowed");
      }
      threshold = decoded > 0n ? decoded : 0n;
      break;
    }
    case 0x02: {
      if (witness.length !== 65) return reject("witness", "schnorr-signature/v1 takes a 65-byte signature", "borrowed");
      if (!params.signatureValid({ role: "borrow", familyInput: 0, scheme: "schnorr-signature/v1", publicKey: leader.borrowGuard, signature: kccHex(witness) })) {
        return reject("borrow", "the borrow signature does not verify under borrow_guard", "borrowed");
      }
      break;
    }
    case 0x03: {
      if (witness.length !== 129) return reject("witness", "hash-chain/v1 takes exactly 129 bytes", "borrowed");
      const revealed = kccHex(witness.slice(0, 32));
      const oneTimeKey = kccHex(witness.slice(32, 64));
      if (kcc20HashChainLink(revealed, oneTimeKey) !== leader.borrowGuard) return reject("borrow_guard", "the revealed link does not hash to the leader's borrow_guard", "borrowed");
      nextGuard = revealed;
      if (!params.signatureValid({ role: "borrow", familyInput: 0, scheme: "hash-chain/v1", publicKey: oneTimeKey, signature: kccHex(witness.slice(64)) })) {
        return reject("borrow", "the borrow signature does not verify under the one-time key", "borrowed");
      }
      break;
    }
    default:
      return reject("borrow_scheme", `borrow_scheme 0x${leader.borrowScheme.toString(16)} is unassigned`, "borrowed");
  }
  const increase = next.amount - leader.amount;
  if (!(increase > threshold)) return reject("amount", `the amount increase ${increase} does not strictly exceed the effective threshold ${threshold}`, "borrowed");
  if (next.borrowScheme !== leader.borrowScheme) return reject("borrow_scheme", "the borrowed successor changes borrow_scheme", "borrowed");
  if (next.borrowGuard !== nextGuard) return reject("borrow_guard", "the borrowed successor does not carry the expected next borrow_guard", "borrowed");
  if (next.owner !== leader.owner) return reject("owner", "the borrowed successor does not preserve owner", "borrowed");
  if (next.ownerScheme !== leader.ownerScheme) return reject("owner_scheme", "the borrowed successor does not preserve owner_scheme", "borrowed");
  if (next.extensionCommitment !== leader.extensionCommitment) return reject("extension_commitment", "the borrowed successor does not preserve extension_commitment", "borrowed");
  if (params.successor.kasValueSompi < params.leader.kasValueSompi) return reject("kas_value", "the borrowed successor output carries less KAS than the borrowed input", "borrowed");
  return { accepted: true, path: "borrowed", reason: "borrowed receive" };
}

/**
 * The leader's validation of a complete KCC-20 transfer (§2, §5), off chain: cardinality bounds, next_states equal to the
 * family's continuation outputs, non-negative amounts within the int range (and the total, when limited), conservation of
 * the total amount, supported owner schemes and assigned borrow schemes on every successor, one extension commitment
 * across the family, the witness path, the owners' minimum KCC-2 approvals (leader on the normal path, every delegator
 * always) and, on the borrowed path, the borrowed-receive rules. The first rule that fails is reported.
 * Not checked here (R-06), all of which the token's covenant program checks on chain:
 * - the continuation outputs' programs (their script public keys) and covenant bindings (Covenant ID, authorizing input),
 *   which KCC-20 §2 also requires of the leader;
 * - the entrypoint each input calls (`transfer` for the leader, `transfer_delegator` for the others; KCC-20 §2, KCC-1
 *   §3.8.1);
 * - the family and the leader's position: taken from the order of `inputs`, as the caller gives it;
 * - the input states: supplied by the caller, not decoded from the authenticated programs the inputs spend.
 * Signatures are the caller's to verify (`signatureValid`).
 */
export function kcc20CheckTransfer(tr: Kcc20Transfer): Kcc20Verdict {
  const config = kcc20CheckConfig(tr.config ?? KCC20_DEFAULT_CONFIG);
  if (tr.inputs.length === 0) return reject("inputs", "a transfer consumes at least one token input (the leader)");
  if (tr.inputs.length > config.maxTokenInputs) return reject("max_token_inputs", `${tr.inputs.length} token inputs exceed max_token_inputs ${config.maxTokenInputs}`);
  if (tr.outputs.length > config.maxTokenOutputs) return reject("max_token_outputs", `${tr.outputs.length} token outputs exceed max_token_outputs ${config.maxTokenOutputs}`);
  if (tr.nextStates.length !== tr.outputs.length) return reject("next_states", `next_states has ${tr.nextStates.length} states for ${tr.outputs.length} continuation outputs`);
  for (let i = 0; i < tr.outputs.length; i++) {
    if (!sameState(tr.nextStates[i]!, tr.outputs[i]!.state)) return reject("next_states", `next_states[${i}] is not the state of continuation output ${i}`);
  }
  const all = [...tr.inputs.map((x, i) => [`input ${i}`, x.state] as const), ...tr.nextStates.map((s, i) => [`next_states[${i}]`, s] as const)];
  for (const [where, s] of all) {
    if (s.amount < 0n) return reject("amount", `${where}: the amount ${s.amount} is negative`);
    if (s.amount > INT_MAX) return reject("amount", `${where}: the amount is outside the int range`);
  }
  const totalIn = tr.inputs.reduce((n, x) => n + x.state.amount, 0n);
  const totalOut = tr.nextStates.reduce((n, s) => n + s.amount, 0n);
  if (config.limitTotalAmount && (totalIn > INT_MAX || totalOut > INT_MAX)) return reject("amount", "the total amount exceeds 2^63 - 1");
  if (totalIn !== totalOut) return reject("conservation", `total successor amount ${totalOut} does not equal total input amount ${totalIn}`);
  for (let i = 0; i < tr.nextStates.length; i++) {
    const s = tr.nextStates[i]!;
    if (!config.ownerSchemes.includes(s.ownerScheme)) return reject("owner_scheme", `next_states[${i}]: owner_scheme 0x${s.ownerScheme.toString(16)} is not supported by the configuration`);
    if (s.borrowScheme > 0x03) return reject("borrow_scheme", `next_states[${i}]: borrow_scheme 0x${s.borrowScheme.toString(16)} is unassigned`);
  }
  const commitment = tr.inputs[0]!.state.extensionCommitment;
  for (const [where, s] of all) {
    if (s.extensionCommitment !== commitment) return reject("extension_commitment", `${where}: extension_commitment differs from the family's`);
  }
  const witness = kccBytes(tr.inputs[0]!.witness, "leader witness");
  if (witness.length === 0) return reject("witness", "the leader's witness is empty");
  const path = witness[0] === 0x00 ? "normal" : witness[0] === 0x01 ? "borrowed" : undefined;
  if (!path) return reject("witness", `witness path byte 0x${witness[0]!.toString(16).padStart(2, "0")} is reserved`);
  for (let i = 1; i < tr.inputs.length; i++) {
    const v = ownerAuthorized(tr.inputs[i]!.state, kccBytes(tr.inputs[i]!.witness, `input ${i} witness`), "delegate-owner", i, tr, config);
    if (v) return { ...v, path };
  }
  if (path === "normal") {
    const v = ownerAuthorized(tr.inputs[0]!.state, witness.slice(1), "leader-owner", 0, tr, config);
    return v ? { ...v, path } : { accepted: true, path, reason: "owner-authorized transfer" };
  }
  if (tr.outputs.length === 0) return reject("next_states", "a borrowed receive needs next_states[0]", "borrowed");
  return kcc20CheckBorrowedReceive({
    leader: { state: tr.inputs[0]!.state, kasValueSompi: tr.inputs[0]!.kasValueSompi },
    successor: { state: tr.nextStates[0]!, kasValueSompi: tr.outputs[0]!.kasValueSompi },
    borrowWitness: witness.slice(1),
    config,
    signatureValid: tr.signatureValid
  });
}

// ---------------------------------------------------------------------------
// SilverScript interop: a compiled contract's ABI read as KCC-1, its KCC20State as a template view
// ---------------------------------------------------------------------------

/** A silverc ABI type as a KCC-1 type (`temporal` is SilverScript's own and has no KCC-1 type). */
export function kcc1TypeFromSilver(type: SilTypeArtifact): Kcc1Type {
  switch (type.kind) {
    case "int":
    case "bool":
    case "byte":
    case "string":
    case "pubkey":
    case "sig":
    case "datasig":
      return { kind: "scalar", name: type.kind };
    case "bytes":
      return { kind: "array", item: { kind: "scalar", name: "byte" } };
    case "fixed_bytes":
      return { kind: "array", item: { kind: "scalar", name: "byte" }, length: type.len };
    case "fixed_array":
      return { kind: "array", item: kcc1TypeFromSilver(type.item), length: type.len };
    case "dynamic_array":
      return { kind: "array", item: kcc1TypeFromSilver(type.item) };
    case "struct":
      return { kind: "record", name: type.name };
    default:
      throw kccError("KCC1_TYPE_INVALID", `silverc type '${(type as any).kind}' has no KCC-1 type`);
  }
}

/** The artifact's structs as KCC-1 records. */
export function kcc1RecordsFromSilver(artifact: SilAbiArtifact): Kcc1Records {
  return Object.fromEntries(Object.entries(artifact.structs ?? {}).map(([name, s]) => [name, { name, fields: s.fields.map((f) => ({ name: f.name, type: kcc1TypeFromSilver(f.type) })) }]));
}

/** Each entry of a compiled contract: its KCC-1 function signature and dispatch tag next to the tag silverc recorded. */
export function kcc1SilverDispatchTags(artifact: SilAbiArtifact, contractName: string): { entry: string; functionSignature: string; dispatchTag: string; artifactTag: string; matches: boolean }[] {
  const contract = artifact.contracts[contractName];
  if (!contract) throw kccError("KCC20_ARTIFACT_INVALID", `no contract '${contractName}'`);
  const records = kcc1RecordsFromSilver(artifact);
  return Object.entries(contract.entries).map(([entry, e]) => {
    const functionSignature = kcc1FunctionSignature(entry, e.params.map((p) => kcc1TypeFromSilver(p.type)), records);
    const dispatchTag = kcc1DispatchTagOfSignature(functionSignature);
    return { entry, functionSignature, dispatchTag, artifactTag: e.dispatch_tag, matches: dispatchTag === e.dispatch_tag };
  });
}

/**
 * The KCC20State of a compiled SilverScript contract whose runtime state holds the six KCC20State fields consecutively
 * (the reference implementation puts its own template commitment before them, so its program state is 145 bytes): the
 * complete runtime state layout, and the KCC-1 template view selecting the KCC20State fields (KCC-1 §3.7.4).
 */
export function kcc20SilverStateLayout(artifact: SilAbiArtifact, contractName: string): { fields: Kcc1Field[]; records: Kcc1Records; kcc20FieldNames: string[]; stateStart: number; stateLen: number } {
  const contract = artifact.contracts[contractName];
  if (!contract) throw kccError("KCC20_ARTIFACT_INVALID", `no contract '${contractName}'`);
  const records = kcc1RecordsFromSilver(artifact);
  const fields = contract.runtime_state.fields.map((f) => ({ name: f.name, type: kcc1TypeFromSilver(f.type) }));
  const want = KCC20_STATE_RECORD.fields;
  const at = fields.findIndex((_, i) => want.every((w, k) => fields[i + k]?.name === w.name && JSON.stringify(fields[i + k]!.type) === JSON.stringify(w.type)));
  if (at < 0) throw kccError("KCC20_ARTIFACT_INVALID", `contract '${contractName}' has no consecutive KCC20State fields in its runtime state`);
  return { fields, records, kcc20FieldNames: want.map((w) => w.name), stateStart: contract.compiled.state_span.offset, stateLen: contract.compiled.state_span.len };
}

/** The KCC20State and the KCC20State template view of one program R of that contract (strict decoding of its state). */
export function kcc20SilverProgramState(artifact: SilAbiArtifact, contractName: string, redeemScript: Uint8Array): { state: Kcc20State; programState: Record<string, unknown>; view: Kcc1View } {
  const layout = kcc20SilverStateLayout(artifact, contractName);
  const split = kcc1SplitProgram(redeemScript, layout.stateStart, layout.stateLen);
  const programState = kcc1DecodeState(split.encodedState, layout.fields, layout.records).state;
  const view = kcc1TemplateView({ redeemScript, stateStart: layout.stateStart, stateLen: layout.stateLen, fields: layout.fields, records: layout.records, fieldNames: layout.kcc20FieldNames });
  return { state: fromRecord(programState), programState, view };
}

/** Where this implementation's rules come from. */
export const KCC20_SOURCE = { ...KCC_SOURCE, document: KCC_SOURCE.documents.kcc20 } as const;
