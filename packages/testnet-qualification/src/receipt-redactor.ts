/**
 * TQ-1 derived shared receipt.
 *
 * The shared receipt is a NEW artifact deterministically derived from a
 * persisted raw receipt. It is never a mutation of the raw receipt. The
 * raw is authoritative; the shared is a publication-safe projection whose
 * only guarantee is:
 *
 *   "This shared artifact was deterministically derived from the raw
 *    artifact identified by `derivedFrom.digest` according to this shared
 *    schema/version."
 *
 * Rules (agreed 2026-09-15):
 *  - Redaction is an ALLOWLIST projection, not a denylist filter. Fields
 *    not explicitly copied here do not reach the shared artifact.
 *  - `derivedFrom.digest` refers to the exact bytes read back from the
 *    raw receipt file. This module reads the raw from disk before
 *    projecting, so the digest reflects true chain-of-custody. It does not
 *    trust an in-memory raw object.
 *  - The shared schema is DISTINCT from the raw schema. A shared artifact
 *    can never be mistaken for a raw receipt by consumers checking the
 *    `schema` field.
 *  - Verification of a shared against a raw is a straight digest compare.
 *    If the raw bytes changed after derivation, verification MUST fail;
 *    this module does NOT silently regenerate the digest.
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  RAW_RECEIPT_SCHEMA,
  RAW_RECEIPT_SCHEMA_VERSION,
  ReceiptPersistenceError,
  canonicalizeReceipt,
  readRawReceipt,
  sanitizeNetworkForFs,
  formatUtcTimestampForFilename,
  type QualificationOutcome,
  type QualificationToolchainIdentity,
  type ReceiptRemoteAuthority,
  type ReceiptSourceUtxoEvidence,
  type ReceiptSubmissionOutcome,
  type ReceiptAcceptanceEvidence,
  type ReceiptInclusionEvidence,
  type ReceiptConfirmationEvidence,
  type TestnetQualificationReceipt
} from "./receipt.js";

export const SHARED_RECEIPT_SCHEMA = "hardkas.testnet-qualification.shared-receipt";
export const SHARED_RECEIPT_SCHEMA_VERSION = 1 as const;

// Governance invariant: RAW_RECEIPT_SCHEMA !== SHARED_RECEIPT_SCHEMA.
// Enforced by unit test `receipt-redactor.unit.test.ts > "uses a schema
// DISTINCT from the raw receipt"`. Not enforced at module load time — a
// schema-governance mistake must not be able to terminate a production
// process merely by importing this package.

/** Shape of the derivedFrom pointer. */
export interface DerivedFromPointer {
  readonly algorithm: "sha256";
  readonly digest: string;
  readonly rawSchema: typeof RAW_RECEIPT_SCHEMA;
  readonly rawSchemaVersion: typeof RAW_RECEIPT_SCHEMA_VERSION;
}

/** Redacted view of `ReceiptRemoteAuthority` — endpoint address is hashed. */
export interface SharedRemoteAuthority {
  readonly authorityKind: "REMOTE_TESTNET_NODE";
  readonly endpoint: { readonly class: string; readonly hostHash: string };
  readonly observedAt: string;
  readonly network: { readonly expected: string; readonly observed: string };
  readonly serverVersion: string;
  readonly rpcApiVersion?: string | number;
  readonly isSynced: boolean;
  readonly hasUtxoIndex: boolean;
  readonly virtualDaaScore: string;
  readonly capabilities: {
    readonly getNetworkParams: boolean;
    readonly getFeeEstimate: boolean;
    readonly hasUtxoIndex: boolean;
  };
  readonly probeHashes: {
    readonly getServerInfo: string;
    readonly getBlockDagInfo: string;
    readonly getNetworkParams?: string;
    readonly getFeeEstimate?: string;
  };
}

/**
 * Redacted view of `ReceiptSourceUtxoEvidence`. Public blockchain
 * identifiers (outpoint, address, amount, blockDaaScore) are preserved
 * because they are inherently public; `localReservation` is intentionally
 * dropped — it is a TQ-runner-local marker with no public meaning.
 */
export interface SharedSourceUtxoEvidence {
  readonly outpoint: { readonly transactionId: string; readonly index: number };
  readonly address: string;
  readonly amountSompi: string;
  readonly scriptPublicKey?: string;
  readonly isCoinbase: boolean;
  readonly blockDaaScore?: string;
  readonly observedVirtualDaaScore?: string;
  readonly observedAt: string;
  readonly maturityResolvedVia: "not-coinbase" | "matured" | "n/a-no-context";
}

/** Redacted view of `ReceiptSubmissionOutcome` — `lastError` never included. */
export interface SharedSubmissionOutcome {
  readonly state: ReceiptSubmissionOutcome["state"];
  readonly txid: string;
  readonly attempts: number;
  readonly resolvedVia: string;
  readonly witnessAddress?: string;
  readonly resolvedAt: string;
}

export interface SharedEvidence {
  readonly remoteAuthority?: SharedRemoteAuthority;
  readonly funding?: readonly SharedSourceUtxoEvidence[];
  readonly submissions?: readonly SharedSubmissionOutcome[];
  readonly acceptances?: readonly ReceiptAcceptanceEvidence[];
  readonly inclusions?: readonly ReceiptInclusionEvidence[];
  readonly confirmations?: readonly ReceiptConfirmationEvidence[];
  // `notes` from the raw receipt is INTENTIONALLY not projected.
}

export interface SharedQualificationReceipt {
  readonly schema: typeof SHARED_RECEIPT_SCHEMA;
  readonly schemaVersion: typeof SHARED_RECEIPT_SCHEMA_VERSION;
  readonly derivedFrom: DerivedFromPointer;
  readonly qualificationId: string;
  readonly network: string;
  readonly outcome: QualificationOutcome;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly toolchain: QualificationToolchainIdentity;
  readonly evidence: SharedEvidence;
}

function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function hashEndpointHost(address: string): string {
  return sha256Hex(address);
}

function projectRemoteAuthority(a: ReceiptRemoteAuthority): SharedRemoteAuthority {
  return {
    authorityKind: a.authorityKind,
    endpoint: { class: a.endpoint.class, hostHash: hashEndpointHost(a.endpoint.address) },
    observedAt: a.observedAt,
    network: a.network,
    serverVersion: a.serverVersion,
    ...(a.rpcApiVersion !== undefined ? { rpcApiVersion: a.rpcApiVersion } : {}),
    isSynced: a.isSynced,
    hasUtxoIndex: a.hasUtxoIndex,
    virtualDaaScore: a.virtualDaaScore,
    capabilities: a.capabilities,
    probeHashes: a.probeHashes
  };
}

function projectFunding(f: ReceiptSourceUtxoEvidence): SharedSourceUtxoEvidence {
  const out: any = {
    outpoint: f.outpoint,
    address: f.address,
    amountSompi: f.amountSompi,
    isCoinbase: f.isCoinbase,
    observedAt: f.observedAt,
    maturityResolvedVia: f.maturityResolvedVia
  };
  if (f.scriptPublicKey !== undefined) out.scriptPublicKey = f.scriptPublicKey;
  if (f.blockDaaScore !== undefined) out.blockDaaScore = f.blockDaaScore;
  if (f.observedVirtualDaaScore !== undefined) out.observedVirtualDaaScore = f.observedVirtualDaaScore;
  return out;
}

function projectSubmission(s: ReceiptSubmissionOutcome): SharedSubmissionOutcome {
  const out: any = {
    state: s.state,
    txid: s.txid,
    attempts: s.attempts,
    resolvedVia: s.resolvedVia,
    resolvedAt: s.resolvedAt
  };
  if (s.witnessAddress !== undefined) out.witnessAddress = s.witnessAddress;
  return out;
}

function projectAcceptance(a: ReceiptAcceptanceEvidence): ReceiptAcceptanceEvidence {
  return { txid: a.txid, acceptedAt: a.acceptedAt, detectedVia: a.detectedVia, witnessAddress: a.witnessAddress };
}

function projectInclusion(i: ReceiptInclusionEvidence): ReceiptInclusionEvidence {
  return { txid: i.txid, inclusionBlockHash: i.inclusionBlockHash, inclusionDaaScore: i.inclusionDaaScore, observedAt: i.observedAt };
}

function projectConfirmation(c: ReceiptConfirmationEvidence): ReceiptConfirmationEvidence {
  return {
    txid: c.txid,
    inclusionBlockHash: c.inclusionBlockHash,
    inclusionDaaScore: c.inclusionDaaScore,
    observedAt: c.observedAt,
    virtualDaaScoreAtObservation: c.virtualDaaScoreAtObservation,
    deltaDaa: c.deltaDaa,
    configuredDaaDelta: c.configuredDaaDelta,
    criterion: c.criterion
  };
}

function projectEvidence(ev: TestnetQualificationReceipt["evidence"]): SharedEvidence {
  const out: SharedEvidence = {
    ...(ev.remoteAuthority ? { remoteAuthority: projectRemoteAuthority(ev.remoteAuthority) } : {}),
    ...(ev.funding ? { funding: ev.funding.map(projectFunding) } : {}),
    ...(ev.submissions ? { submissions: ev.submissions.map(projectSubmission) } : {}),
    ...(ev.acceptances ? { acceptances: ev.acceptances.map(projectAcceptance) } : {}),
    ...(ev.inclusions ? { inclusions: ev.inclusions.map(projectInclusion) } : {}),
    ...(ev.confirmations ? { confirmations: ev.confirmations.map(projectConfirmation) } : {})
    // `notes` intentionally not projected.
  };
  return out;
}

function projectToolchain(t: QualificationToolchainIdentity): QualificationToolchainIdentity {
  const out: any = { hardkas: { version: t.hardkas.version } };
  if (t.kaspaWasm) {
    out.kaspaWasm = { version: t.kaspaWasm.version };
    if (t.kaspaWasm.digest !== undefined) out.kaspaWasm.digest = t.kaspaWasm.digest;
  }
  if (t.silverc) {
    out.silverc = { version: t.silverc.version };
    if (t.silverc.digest !== undefined) out.silverc.digest = t.silverc.digest;
  }
  return out;
}

export interface DeriveSharedInput {
  /** Absolute path to a previously persisted raw receipt. */
  readonly rawFilePath: string;
}

export interface DerivedShared {
  readonly shared: SharedQualificationReceipt;
  /** The exact bytes of the raw receipt that reached disk. */
  readonly sourceBytes: Uint8Array;
  /** The digest of `sourceBytes` (same value as `shared.derivedFrom.digest`). */
  readonly sourceDigest: string;
}

/**
 * Derive a shared receipt from a raw receipt on disk. Reads the raw file
 * to obtain the exact persisted bytes, computes their sha256, then builds
 * the shared artifact via an allowlist projection. `derivedFrom.digest`
 * always refers to the read-back bytes.
 */
export async function deriveSharedReceipt(input: DeriveSharedInput): Promise<DerivedShared> {
  const raw = await readRawReceipt(input.rawFilePath);
  const shared: SharedQualificationReceipt = {
    schema: SHARED_RECEIPT_SCHEMA,
    schemaVersion: SHARED_RECEIPT_SCHEMA_VERSION,
    derivedFrom: {
      algorithm: "sha256",
      digest: raw.digest.value,
      rawSchema: RAW_RECEIPT_SCHEMA,
      rawSchemaVersion: RAW_RECEIPT_SCHEMA_VERSION
    },
    qualificationId: raw.receipt.qualificationId,
    network: raw.receipt.network,
    outcome: raw.receipt.outcome,
    startedAt: raw.receipt.startedAt,
    completedAt: raw.receipt.completedAt,
    toolchain: projectToolchain(raw.receipt.toolchain),
    evidence: projectEvidence(raw.receipt.evidence)
  };
  return { shared, sourceBytes: raw.bytes, sourceDigest: raw.digest.value };
}

/**
 * Canonicalize a shared receipt to bytes using the same rules as the raw
 * receipt (sorted keys, bigints as strings, single trailing newline).
 */
export function canonicalizeSharedReceipt(shared: SharedQualificationReceipt): Uint8Array {
  return canonicalizeReceipt(shared as unknown as TestnetQualificationReceipt);
}

export interface PersistSharedInput {
  readonly shared: SharedQualificationReceipt;
  readonly sharedDir: string;
}

export interface PersistedShared {
  readonly filePath: string;
  readonly filename: string;
  readonly bytes: Uint8Array;
  readonly digest: { readonly algorithm: "sha256"; readonly value: string };
}

export function sharedReceiptFilename(network: string, completedAt: Date): string {
  return `TESTNET_QUALIFICATION_${sanitizeNetworkForFs(network)}_${formatUtcTimestampForFilename(completedAt)}_shared.json`;
}

/**
 * Persist a shared receipt append-only. Same immutability semantics as the
 * raw persister (`ALREADY_EXISTS` on collision, readback verification).
 */
export async function persistSharedReceipt(input: PersistSharedInput): Promise<PersistedShared> {
  if (!input || !input.shared || typeof input.sharedDir !== "string" || input.sharedDir.length === 0) {
    throw new ReceiptPersistenceError("BAD_INPUT", "persistSharedReceipt requires { shared, sharedDir }");
  }
  const bytes = canonicalizeSharedReceipt(input.shared);
  const filename = sharedReceiptFilename(input.shared.network, new Date(input.shared.completedAt));
  const filePath = path.join(input.sharedDir, filename);
  await fs.mkdir(input.sharedDir, { recursive: true });

  let handle;
  try {
    handle = await fs.open(filePath, "wx");
  } catch (err: any) {
    if (err && err.code === "EEXIST") {
      throw new ReceiptPersistenceError(
        "ALREADY_EXISTS",
        `Shared receipt already exists at ${filePath}; refusing to overwrite.`,
        { filePath }
      );
    }
    throw new ReceiptPersistenceError(
      "WRITE_FAILED",
      `Failed to open ${filePath} for exclusive write: ${err instanceof Error ? err.message : String(err)}`,
      { filePath }
    );
  }
  try {
    await handle.writeFile(bytes);
    try { await handle.sync(); } catch { /* fsync unsupported */ }
  } catch (err: any) {
    await handle.close().catch(() => undefined);
    throw new ReceiptPersistenceError("WRITE_FAILED", `Failed to write ${filePath}: ${err instanceof Error ? err.message : String(err)}`, { filePath });
  }
  await handle.close();

  const buf = await fs.readFile(filePath);
  const readback = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  if (readback.length !== bytes.length) {
    throw new ReceiptPersistenceError("READBACK_MISMATCH", `Shared receipt readback length mismatch at ${filePath}`, { filePath });
  }
  for (let i = 0; i < readback.length; i++) {
    if (readback[i] !== bytes[i]) {
      throw new ReceiptPersistenceError("READBACK_MISMATCH", `Shared receipt readback mismatch at byte ${i}`, { filePath });
    }
  }
  return {
    filePath,
    filename,
    bytes: readback,
    digest: { algorithm: "sha256", value: sha256Hex(readback) }
  };
}

export interface VerifySharedResult {
  readonly ok: boolean;
  readonly expectedDigest: string;
  readonly actualDigest: string;
  readonly reason?: "DIGEST_MISMATCH" | "SHARED_SCHEMA_INVALID";
}

/**
 * Verify a shared receipt against a raw receipt's current bytes.
 *
 * `ok === true` iff `sha256(rawBytes) === shared.derivedFrom.digest`. On
 * mismatch, the reason is DIGEST_MISMATCH — the shared artifact still
 * describes its historical raw bytes; it is the *raw* that has diverged.
 *
 * Also validates that the shared carries the current shared schema
 * version. Unsupported shared schema versions → SHARED_SCHEMA_INVALID.
 */
export function verifySharedAgainstRaw(input: {
  shared: SharedQualificationReceipt;
  rawBytes: Uint8Array;
}): VerifySharedResult {
  if (input.shared.schema !== SHARED_RECEIPT_SCHEMA) {
    return {
      ok: false,
      expectedDigest: input.shared.derivedFrom.digest,
      actualDigest: "",
      reason: "SHARED_SCHEMA_INVALID"
    };
  }
  if (input.shared.schemaVersion !== SHARED_RECEIPT_SCHEMA_VERSION) {
    return {
      ok: false,
      expectedDigest: input.shared.derivedFrom.digest,
      actualDigest: "",
      reason: "SHARED_SCHEMA_INVALID"
    };
  }
  const actual = sha256Hex(input.rawBytes);
  return {
    ok: actual === input.shared.derivedFrom.digest,
    expectedDigest: input.shared.derivedFrom.digest,
    actualDigest: actual,
    ...(actual !== input.shared.derivedFrom.digest ? { reason: "DIGEST_MISMATCH" as const } : {})
  };
}
