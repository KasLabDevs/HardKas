/**
 * TQ-1 raw qualification receipt.
 *
 * Owns PERSISTENCE ONLY. This module does not submit, query consensus,
 * infer confirmation, reinterpret Block 2 submission states, discover
 * funding inputs, or access private keys.
 *
 * Architectural invariant (agreed 2026-09-15):
 *   Raw evidence is immutable. Once a raw receipt has been persisted at a
 *   given filesystem path, that byte sequence never changes. The persistence
 *   API refuses to overwrite, merge, or truncate an existing target — the
 *   caller receives an explicit `ALREADY_EXISTS` collision error and must
 *   handle it.
 *
 * Canonical bytes contract:
 *   The digest reported on persistence is `sha256` over the EXACT bytes
 *   that reached disk (read back after write). It is NOT computed over the
 *   in-memory receipt object. This preserves chain-of-custody semantics —
 *   `derivedFrom` on a shared receipt (Block 3, `receipt-redactor.ts`)
 *   references what actually landed on disk, not what we thought we
 *   serialized.
 *
 *   Serialization rules:
 *     - UTF-8 encoded JSON.
 *     - Object keys sorted lexicographically at every level.
 *     - `undefined` fields are omitted.
 *     - `bigint` values are serialized as base-10 strings. Callers
 *       constructing a receipt MUST use string form for fields declared as
 *       string in this file's types (e.g. DAA scores) — the serializer
 *       accepts either but the schema publishes strings.
 *     - Single trailing `\n` (POSIX file convention).
 *
 * Observation semantics (Block 2 boundary):
 *   `SubmissionOutcome`, `AcceptanceEvidence`, `InclusionEvidence`,
 *   `ConfirmationEvidence`, `SourceUtxoEvidence`, `RemoteTestnetAuthority`
 *   are recorded verbatim (in receipt form — bigints as strings). This
 *   module does NOT convert `OBSERVED_MEMPOOL` into anything stronger like
 *   `confirmed` or `final`, and does NOT combine `ConfirmationEvidence`
 *   into a "consensus valid" verdict. Interpretation belongs to the runner
 *   / downstream verifiers.
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const RAW_RECEIPT_SCHEMA = "hardkas.testnet-qualification.receipt";
export const RAW_RECEIPT_SCHEMA_VERSION = 1 as const;

export type QualificationOutcome = "PASS" | "FAIL" | "UNRESOLVED";

/**
 * Toolchain identity as recorded on the receipt. Mirrors — but does not
 * yet reference — the future `ToolchainIdentity` architecture; each
 * component is optional so the receipt can be emitted before every toolchain
 * is bound.
 */
export interface QualificationToolchainIdentity {
  readonly hardkas: { readonly version: string };
  readonly kaspaWasm?: { readonly version: string; readonly digest?: string };
  readonly silverc?: { readonly version: string; readonly digest?: string };
}

/**
 * Reference to an external artifact produced during qualification (a
 * TxPlanArtifact file, a Silver compilation output, etc.). Only the
 * addressing/digest is recorded here; the artifact itself lives elsewhere.
 */
export interface QualificationArtifactReference {
  readonly kind: string;
  readonly path?: string;
  readonly digest?: { readonly algorithm: "sha256"; readonly value: string };
}

/** Receipt form of `RemoteTestnetAuthority` — bigints as strings. */
export interface ReceiptRemoteAuthority {
  readonly authorityKind: "REMOTE_TESTNET_NODE";
  readonly endpoint: { readonly class: string; readonly address: string };
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

/** Receipt form of `SourceUtxoEvidence`. */
export interface ReceiptSourceUtxoEvidence {
  readonly outpoint: { readonly transactionId: string; readonly index: number };
  readonly address: string;
  readonly amountSompi: string;
  readonly scriptPublicKey?: string;
  readonly isCoinbase: boolean;
  readonly blockDaaScore?: string;
  readonly observedVirtualDaaScore?: string;
  readonly observedAt: string;
  readonly maturityResolvedVia: "not-coinbase" | "matured" | "n/a-no-context";
  readonly localReservation?: { readonly kind: "tq-local"; readonly tag: string };
}

/** Receipt form of `SubmissionOutcome` — `lastError` is intentionally excluded. */
export interface ReceiptSubmissionOutcome {
  readonly state: "SUBMITTED" | "OBSERVED_MEMPOOL" | "OBSERVED_ACCEPTED" | "SAFE_TO_RETRY" | "UNRESOLVED";
  readonly txid: string;
  readonly attempts: number;
  readonly resolvedVia: string;
  readonly witnessAddress?: string;
  readonly resolvedAt: string;
}

export interface ReceiptAcceptanceEvidence {
  readonly txid: string;
  readonly acceptedAt: string;
  readonly detectedVia: "mempool-gone+utxo-present" | "utxo-present-first-observation" | "server-confirmation";
  readonly witnessAddress: string;
}

export interface ReceiptInclusionEvidence {
  readonly txid: string;
  readonly inclusionBlockHash: string;
  readonly inclusionDaaScore: string;
  readonly observedAt: string;
}

export interface ReceiptConfirmationEvidence extends ReceiptInclusionEvidence {
  readonly virtualDaaScoreAtObservation: string;
  readonly deltaDaa: string;
  readonly configuredDaaDelta: string;
  readonly criterion: string;
}

export interface QualificationEvidence {
  readonly remoteAuthority?: ReceiptRemoteAuthority;
  readonly funding?: readonly ReceiptSourceUtxoEvidence[];
  readonly submissions?: readonly ReceiptSubmissionOutcome[];
  readonly acceptances?: readonly ReceiptAcceptanceEvidence[];
  readonly inclusions?: readonly ReceiptInclusionEvidence[];
  readonly confirmations?: readonly ReceiptConfirmationEvidence[];
  /**
   * Free-form observations that do not fit the typed slots above. Callers
   * MUST NOT place secrets here — the redactor's allowlist projection does
   * NOT propagate `notes` to shared receipts by default. This slot is
   * strictly for structured local-only annotations.
   */
  readonly notes?: Readonly<Record<string, unknown>>;
}

export interface TestnetQualificationReceipt {
  readonly schema: typeof RAW_RECEIPT_SCHEMA;
  readonly schemaVersion: typeof RAW_RECEIPT_SCHEMA_VERSION;
  readonly qualificationId: string;
  readonly network: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly outcome: QualificationOutcome;
  readonly toolchain: QualificationToolchainIdentity;
  readonly evidence: QualificationEvidence;
  readonly artifacts?: readonly QualificationArtifactReference[];
}

export type ReceiptPersistenceReason =
  | "ALREADY_EXISTS"
  | "WRITE_FAILED"
  | "READBACK_MISMATCH"
  | "SCHEMA_INVALID"
  | "BAD_INPUT";

export class ReceiptPersistenceError extends Error {
  readonly reason: ReceiptPersistenceReason;
  readonly detail: Record<string, unknown> | undefined;
  constructor(reason: ReceiptPersistenceReason, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = "ReceiptPersistenceError";
    this.reason = reason;
    this.detail = detail;
  }
}

/**
 * Serializes a JS value into a JSON-safe structure with sorted keys.
 * - bigints → base-10 strings
 * - undefined fields → omitted
 * - arrays: order preserved (caller's semantic ordering — chronological, etc.)
 * - object keys: lexicographically sorted at every depth
 *
 * The resulting structure is safe to pass to `JSON.stringify`.
 */
export function toReceiptJsonSafe(value: unknown): unknown {
  if (value === undefined || value === null) return value ?? null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(toReceiptJsonSafe);
  const src = value as Record<string, unknown>;
  const keys = Object.keys(src).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = src[k];
    if (v === undefined) continue;
    out[k] = toReceiptJsonSafe(v);
  }
  return out;
}

/**
 * Canonicalize a receipt to the exact byte sequence that will land on
 * disk. Idempotent: two calls on structurally-equal inputs produce
 * byte-identical output.
 */
export function canonicalizeReceipt(receipt: TestnetQualificationReceipt): Uint8Array {
  const safe = toReceiptJsonSafe(receipt);
  const text = JSON.stringify(safe) + "\n";
  return new TextEncoder().encode(text);
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Normalize a network id for filesystem-safe use. Any character outside
 * `[A-Za-z0-9._-]` is replaced with `_`. Empty result maps to `unknown`.
 * The unsanitized `network` remains in the receipt payload.
 */
export function sanitizeNetworkForFs(network: string): string {
  const cleaned = network.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned : "unknown";
}

/**
 * Format a UTC timestamp deterministically for filename use. Sortable when
 * used as part of a filename. Example: `2026-09-15T07:15:30.123Z` →
 * `20260915T071530123Z`.
 */
export function formatUtcTimestampForFilename(d: Date): string {
  const iso = d.toISOString(); // e.g. 2026-09-15T07:15:30.123Z
  return iso.replace(/[-:]/g, "").replace(".", "");
}

/**
 * Compose the canonical raw receipt filename:
 * `TESTNET_QUALIFICATION_<network>_<UTC>.json`
 * where `<UTC>` is derived from `completedAt`. Sorting the resulting
 * filenames chronologically also sorts them by completion time.
 */
export function receiptFilename(network: string, completedAt: Date): string {
  return `TESTNET_QUALIFICATION_${sanitizeNetworkForFs(network)}_${formatUtcTimestampForFilename(completedAt)}.json`;
}

function assertValidReceiptShape(r: unknown): asserts r is TestnetQualificationReceipt {
  if (!r || typeof r !== "object" || Array.isArray(r)) {
    throw new ReceiptPersistenceError("SCHEMA_INVALID", "Receipt payload must be a JSON object");
  }
  const anyR = r as Record<string, unknown>;
  if (anyR.schema !== RAW_RECEIPT_SCHEMA) {
    throw new ReceiptPersistenceError("SCHEMA_INVALID", `Receipt schema must be '${RAW_RECEIPT_SCHEMA}', got '${String(anyR.schema)}'`);
  }
  if (anyR.schemaVersion !== RAW_RECEIPT_SCHEMA_VERSION) {
    throw new ReceiptPersistenceError("SCHEMA_INVALID", `Unsupported raw schema version ${String(anyR.schemaVersion)} (this build supports ${RAW_RECEIPT_SCHEMA_VERSION})`);
  }
  for (const required of ["qualificationId", "network", "startedAt", "completedAt", "outcome", "toolchain", "evidence"]) {
    if (!(required in anyR)) {
      throw new ReceiptPersistenceError("SCHEMA_INVALID", `Receipt missing required field '${required}'`);
    }
  }
  if (!["PASS", "FAIL", "UNRESOLVED"].includes(String(anyR.outcome))) {
    throw new ReceiptPersistenceError("SCHEMA_INVALID", `Receipt outcome must be one of PASS|FAIL|UNRESOLVED, got '${String(anyR.outcome)}'`);
  }
}

export interface PersistRawReceiptInput {
  readonly receipt: TestnetQualificationReceipt;
  readonly rawDir: string;
}

export interface PersistedRawReceipt {
  readonly filePath: string;
  readonly filename: string;
  readonly bytes: Uint8Array;
  readonly digest: { readonly algorithm: "sha256"; readonly value: string };
}

/**
 * Persist a raw qualification receipt.
 *
 * Guarantees:
 *  - The final file is created via O_EXCL semantics (`flag: 'wx'`), so an
 *    existing file at the same path is NEVER overwritten. On collision
 *    throws `ReceiptPersistenceError { reason: 'ALREADY_EXISTS' }`.
 *  - After write, the file is read back and compared byte-for-byte against
 *    the canonicalized input. Any mismatch throws `READBACK_MISMATCH` — the
 *    caller must NOT proceed with the persisted file.
 *  - The digest reported is `sha256` over the read-back bytes.
 */
export async function persistRawReceipt(input: PersistRawReceiptInput): Promise<PersistedRawReceipt> {
  if (!input || !input.receipt || typeof input.rawDir !== "string" || input.rawDir.length === 0) {
    throw new ReceiptPersistenceError("BAD_INPUT", "persistRawReceipt requires { receipt, rawDir }");
  }
  assertValidReceiptShape(input.receipt);

  const canonicalBytes = canonicalizeReceipt(input.receipt);
  const filename = receiptFilename(input.receipt.network, new Date(input.receipt.completedAt));
  const filePath = path.join(input.rawDir, filename);

  await fs.mkdir(input.rawDir, { recursive: true });

  let handle;
  try {
    handle = await fs.open(filePath, "wx");
  } catch (err: any) {
    if (err && err.code === "EEXIST") {
      throw new ReceiptPersistenceError(
        "ALREADY_EXISTS",
        `Raw receipt already exists at ${filePath}; refusing to overwrite (append-only invariant).`,
        { filePath }
      );
    }
    throw new ReceiptPersistenceError(
      "WRITE_FAILED",
      `Failed to open ${filePath} for exclusive write: ${err instanceof Error ? err.message : String(err)}`,
      { filePath, cause: err instanceof Error ? err.message : String(err) }
    );
  }

  try {
    await handle.writeFile(canonicalBytes);
    // Best-effort fsync — on platforms where sync() rejects (e.g. some
    // network filesystems) the caller still gets the readback guarantee
    // below, which is our authoritative post-condition.
    try { await handle.sync(); } catch { /* fsync unsupported; readback still enforces correctness */ }
  } catch (err: any) {
    await handle.close().catch(() => undefined);
    throw new ReceiptPersistenceError(
      "WRITE_FAILED",
      `Failed to write ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      { filePath }
    );
  }
  await handle.close();

  const readback = await fs.readFile(filePath);
  const readbackBytes = new Uint8Array(readback.buffer, readback.byteOffset, readback.byteLength);
  if (!bufferEquals(readbackBytes, canonicalBytes)) {
    throw new ReceiptPersistenceError(
      "READBACK_MISMATCH",
      `Read-back bytes at ${filePath} do not match canonicalized input (length ${readbackBytes.length} vs ${canonicalBytes.length})`,
      { filePath }
    );
  }

  return {
    filePath,
    filename,
    bytes: readbackBytes,
    digest: { algorithm: "sha256", value: sha256Hex(readbackBytes) }
  };
}

export interface ReadRawReceiptResult {
  readonly filePath: string;
  readonly bytes: Uint8Array;
  readonly receipt: TestnetQualificationReceipt;
  readonly digest: { readonly algorithm: "sha256"; readonly value: string };
}

/**
 * Read a previously persisted raw receipt. Returns the exact bytes on
 * disk, their sha256 digest, and the parsed+schema-validated receipt.
 * Throws `SCHEMA_INVALID` on any parse/validate failure — never silently
 * accepts unknown schemas or versions.
 */
export async function readRawReceipt(filePath: string): Promise<ReadRawReceiptResult> {
  const buf = await fs.readFile(filePath);
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const digest = { algorithm: "sha256" as const, value: sha256Hex(bytes) };

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (err: any) {
    throw new ReceiptPersistenceError(
      "SCHEMA_INVALID",
      `Raw receipt at ${filePath} is not valid UTF-8: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err: any) {
    throw new ReceiptPersistenceError(
      "SCHEMA_INVALID",
      `Raw receipt at ${filePath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  assertValidReceiptShape(parsed);
  return { filePath, bytes, receipt: parsed, digest };
}

function bufferEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
