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
/**
 * v2 (TQ1-SCRIPT-BROKEN-1, D7, 2026-10-15): `evidence.submissionAttempts`, the explicit record of the one
 * `submitTransaction` call (`ReceiptSubmissionAttempt`). In v1 a call the guard re-threw left no record at all, so the
 * absence of a submission in a v1 receipt does NOT mean "not attempted" — v1 receipts are not read by this build
 * (no v1 receipt was ever produced by `scripts/testnet-qualification.mjs`, which failed before its runner since it was
 * written; the package is private).
 *
 * v3 (TN10-CONFIRMATION-FIX-1, 2026-10-15): confirmation is blue-score depth of the ACCEPTING CHAIN BLOCK named by the
 * virtual chain, scanned from a start point captured before the submission and bound to the UTXO row
 * (`evidence.startPoints`, `chainAcceptances`, `blueConfirmations`, `chainLooks`). The v2 slots `inclusions` and
 * `confirmations` held a block hash read from a UTXO row (kaspad never serves one) and a DAA delta; a v3 receipt never
 * carries them. This build WRITES v3 only and READS v2 as recorded — a v2 receipt is never rewritten, and its DAA
 * `confirmations` are never read as blue-score confirmations.
 */
export const RAW_RECEIPT_SCHEMA_VERSION = 3 as const;
/** Versions `readRawReceipt` accepts: v2 as recorded (legacy, read-only), v3. */
export const RAW_RECEIPT_READABLE_VERSIONS: readonly number[] = Object.freeze([2, 3]);

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

/**
 * TQ1-SCRIPT-BROKEN-1 (D7): what happened to the ONE `submitTransaction` call, recorded separately from the guard's
 * state so that an unknown outcome is never written as a rejection (or as nothing):
 * - `not_attempted` / attempts 0: never invoked (the run stopped at `stage` first, or the client refused pre-send);
 * - `accepted` / `rejected` / `outcome_unknown`, attempts 1: invoked. `accepted` and `rejected` only when the node's
 *   ANSWER said so (explicit acceptance; explicit, classifiable rejection). Any ambiguous answer is `outcome_unknown`
 *   and stays so even when the independent status query that follows finds the tx — that observation is recorded in
 *   `submissions[].state/resolvedVia` and the acceptance/inclusion slots, never folded back into this record. Never a
 *   resubmission.
 * `reason` is a machine code (the stopping error's code or the guard's `resolvedVia`), never a message.
 */
export interface ReceiptSubmissionAttempt {
  readonly outcome: "not_attempted" | "accepted" | "rejected" | "outcome_unknown";
  readonly attempts: 0 | 1;
  readonly stage: "plan-and-sign" | "submit";
  readonly txid?: string;
  readonly reason?: string;
  readonly recordedAt: string;
}

export interface ReceiptAcceptanceEvidence {
  readonly txid: string;
  readonly acceptedAt: string;
  readonly detectedVia: "mempool-gone+utxo-present" | "utxo-present-first-observation" | "server-confirmation";
  readonly witnessAddress: string;
}

/** v2 only (legacy, read as recorded): a block hash taken from a UTXO row. Never written by v3. */
export interface ReceiptInclusionEvidence {
  readonly txid: string;
  readonly inclusionBlockHash: string;
  readonly inclusionDaaScore: string;
  readonly observedAt: string;
}

/** v2 only (legacy, read as recorded): a DAA delta — NOT blue-score confirmations. Never written by v3. */
export interface ReceiptConfirmationEvidence extends ReceiptInclusionEvidence {
  readonly virtualDaaScoreAtObservation: string;
  readonly deltaDaa: string;
  readonly configuredDaaDelta: string;
  readonly criterion: string;
}

/** v3: the chain position captured before `submitTransaction` — the scan of the virtual chain starts there. */
export interface ReceiptChainStartPoint {
  readonly sinkHash: string;
  readonly sinkBlueScore: string;
  readonly virtualDaaScore: string;
  readonly capturedAt: string;
}

/** v3: ONE look of the product observer (`sdk.tx.observe`), as it was sealed — the evidence a chain claim stands on. */
export interface ReceiptChainLook {
  /** The persisted `hardkas.txObservation.v1` contentHash. */
  readonly observationArtifactId: string;
  /** Local path of that observation (raw only; the shared receipt drops it). */
  readonly observationPath?: string;
  readonly observedAt: string;
  readonly observerId: string;
  readonly point: { readonly sinkHash: string; readonly sinkBlueScore: string; readonly virtualDaaScore: string };
  readonly finding: {
    readonly type: "accepted" | "mempool" | "not_found" | "removed" | "unobservable";
    readonly acceptingBlockHash?: string;
    readonly acceptingBlueScore?: string;
    readonly acceptingDaaScore?: string;
    readonly confirmationsBlue?: string;
    readonly confirmationsDaa?: string;
    readonly finalityReached?: boolean;
    readonly scannedChainBlocks?: number;
    readonly reason?: string;
  };
  /** The state the observer's evidence derived to at that look, under the run's policy. */
  readonly derivedStatus: string;
}

/** v3: the chain block that ACCEPTED the tx — named by the virtual chain, bound to the UTXO row by DAA score. */
export interface ReceiptChainAcceptanceEvidence {
  readonly txid: string;
  readonly method: "virtual-chain-from-submit-start-point";
  readonly startPoint: ReceiptChainStartPoint;
  readonly acceptingBlockHash: string;
  readonly acceptingBlueScore: string;
  readonly acceptingDaaScore?: string;
  readonly utxoBinding: {
    readonly witnessAddress: string;
    readonly utxoBlockDaaScore?: string;
    readonly acceptingDaaScore?: string;
    readonly result: "matches" | "mismatch" | "row-missing" | "not-checkable";
  };
  readonly observation: ReceiptChainLook;
}

/** v3: blue-score confirmations of the accepting block and the policy result. DAA is informational only. */
export interface ReceiptBlueConfirmationEvidence {
  readonly txid: string;
  readonly acceptingBlockHash: string;
  readonly acceptingBlueScore: string;
  readonly sinkBlueScoreAtObservation: string;
  readonly confirmationsBlue: string;
  readonly unit: "blue-score";
  readonly confirmationsDaa?: string;
  readonly observedStatus: string;
  readonly policy: {
    readonly minConfirmations: string;
    readonly unit: "blue-score";
    readonly requestedVia: string;
    readonly satisfied: boolean;
  };
  readonly observationArtifactId: string;
  readonly observedAt: string;
  /** What an RPC observation can and cannot establish (single node; revertible until finality; …). */
  readonly limitations: readonly string[];
}

export interface QualificationEvidence {
  readonly remoteAuthority?: ReceiptRemoteAuthority;
  readonly funding?: readonly ReceiptSourceUtxoEvidence[];
  /** The node's answer to the submission, as the guard classified it. */
  readonly submissions?: readonly ReceiptSubmissionOutcome[];
  /** v2: present whenever a scenario ran — one record per scenario's submission (see ReceiptSubmissionAttempt). */
  readonly submissionAttempts?: readonly ReceiptSubmissionAttempt[];
  /** UTXO-level acceptance signal (mempool gone + output present). Never a confirmation by itself. */
  readonly acceptances?: readonly ReceiptAcceptanceEvidence[];
  /** v2 only — see ReceiptInclusionEvidence. */
  readonly inclusions?: readonly ReceiptInclusionEvidence[];
  /** v2 only — see ReceiptConfirmationEvidence. */
  readonly confirmations?: readonly ReceiptConfirmationEvidence[];
  /** v3: the start point captured before the submission. */
  readonly startPoints?: readonly ReceiptChainStartPoint[];
  /** v3: the accepting chain block (present once the virtual chain named one). */
  readonly chainAcceptances?: readonly ReceiptChainAcceptanceEvidence[];
  /** v3: blue-score confirmation under the policy (present only when the policy was satisfied). */
  readonly blueConfirmations?: readonly ReceiptBlueConfirmationEvidence[];
  /** v3: the last chain look when no accepting block could be established (diagnostics, never a claim). */
  readonly chainLooks?: readonly ReceiptChainLook[];
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
  /** 3 for every receipt this build writes; 2 only for a legacy receipt read as recorded. */
  readonly schemaVersion: typeof RAW_RECEIPT_SCHEMA_VERSION | 2;
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

function assertValidReceiptShape(r: unknown, mode: "write" | "read" = "write"): asserts r is TestnetQualificationReceipt {
  if (!r || typeof r !== "object" || Array.isArray(r)) {
    throw new ReceiptPersistenceError("SCHEMA_INVALID", "Receipt payload must be a JSON object");
  }
  const anyR = r as Record<string, unknown>;
  if (anyR.schema !== RAW_RECEIPT_SCHEMA) {
    throw new ReceiptPersistenceError("SCHEMA_INVALID", `Receipt schema must be '${RAW_RECEIPT_SCHEMA}', got '${String(anyR.schema)}'`);
  }
  if (mode === "write" ? anyR.schemaVersion !== RAW_RECEIPT_SCHEMA_VERSION : !RAW_RECEIPT_READABLE_VERSIONS.includes(anyR.schemaVersion as number)) {
    throw new ReceiptPersistenceError(
      "SCHEMA_INVALID",
      mode === "write"
        ? `This build writes raw schema version ${RAW_RECEIPT_SCHEMA_VERSION} only, got ${String(anyR.schemaVersion)}`
        : `Unsupported raw schema version ${String(anyR.schemaVersion)} (this build reads ${RAW_RECEIPT_READABLE_VERSIONS.join(", ")})`
    );
  }
  for (const required of ["qualificationId", "network", "startedAt", "completedAt", "outcome", "toolchain", "evidence"]) {
    if (!(required in anyR)) {
      throw new ReceiptPersistenceError("SCHEMA_INVALID", `Receipt missing required field '${required}'`);
    }
  }
  if (!["PASS", "FAIL", "UNRESOLVED"].includes(String(anyR.outcome))) {
    throw new ReceiptPersistenceError("SCHEMA_INVALID", `Receipt outcome must be one of PASS|FAIL|UNRESOLVED, got '${String(anyR.outcome)}'`);
  }
  // v2 (D7): an attempt record is consistent — attempts 0 exactly when not_attempted
  const attempts = (anyR.evidence as { submissionAttempts?: unknown } | undefined)?.submissionAttempts;
  if (attempts !== undefined) {
    if (!Array.isArray(attempts)) throw new ReceiptPersistenceError("SCHEMA_INVALID", "evidence.submissionAttempts must be an array");
    for (const a of attempts as Array<Record<string, unknown>>) {
      const outcome = String(a?.outcome);
      if (!["not_attempted", "accepted", "rejected", "outcome_unknown"].includes(outcome)) {
        throw new ReceiptPersistenceError("SCHEMA_INVALID", `submission attempt outcome must be not_attempted|accepted|rejected|outcome_unknown, got '${outcome}'`);
      }
      if (a.attempts !== (outcome === "not_attempted" ? 0 : 1)) {
        throw new ReceiptPersistenceError("SCHEMA_INVALID", `submission attempt '${outcome}' must record attempts ${outcome === "not_attempted" ? 0 : 1}, got ${String(a.attempts)}`);
      }
    }
  }
  if (anyR.schemaVersion === 3) assertV3ConfirmationSemantics(anyR);
}

/**
 * v3 (TN10-CONFIRMATION-FIX-1): confirmation means blue-score depth of an accepting chain block, never a DAA delta and
 * never UTXO presence. A v3 receipt cannot carry the v2 DAA slots, every blue confirmation is internally consistent,
 * and PASS requires a satisfied blue confirmation of a block the virtual chain named and the UTXO row binds.
 */
function assertV3ConfirmationSemantics(r: Record<string, unknown>): void {
  const ev = (r.evidence ?? {}) as Record<string, unknown>;
  for (const legacy of ["inclusions", "confirmations"]) {
    if (ev[legacy] !== undefined) {
      throw new ReceiptPersistenceError("SCHEMA_INVALID", `a v3 receipt never carries evidence.${legacy} (v2 DAA semantics)`);
    }
  }
  const confirmations = (ev.blueConfirmations ?? []) as Array<Record<string, any>>;
  const acceptances = (ev.chainAcceptances ?? []) as Array<Record<string, any>>;
  if (!Array.isArray(confirmations) || !Array.isArray(acceptances)) {
    throw new ReceiptPersistenceError("SCHEMA_INVALID", "evidence.blueConfirmations and evidence.chainAcceptances must be arrays");
  }
  for (const c of confirmations) {
    let blue: bigint;
    let min: bigint;
    try {
      blue = BigInt(c?.confirmationsBlue);
      min = BigInt(c?.policy?.minConfirmations);
    } catch {
      throw new ReceiptPersistenceError("SCHEMA_INVALID", "a blue confirmation needs integer confirmationsBlue and policy.minConfirmations");
    }
    if (c.unit !== "blue-score" || c.policy?.unit !== "blue-score") {
      throw new ReceiptPersistenceError("SCHEMA_INVALID", "a v3 confirmation is counted in blue score");
    }
    if (c.policy?.satisfied !== (blue >= min)) {
      throw new ReceiptPersistenceError("SCHEMA_INVALID", `policy.satisfied=${String(c.policy?.satisfied)} contradicts ${blue} blue-score confirmations against ${min}`);
    }
    const named = acceptances.find((a) => a?.acceptingBlockHash === c.acceptingBlockHash && a?.txid === c.txid);
    if (!named || named.utxoBinding?.result !== "matches") {
      throw new ReceiptPersistenceError("SCHEMA_INVALID", `blue confirmation of ${String(c.acceptingBlockHash)} has no chain acceptance bound to its UTXO row`);
    }
  }
  if (r.outcome === "PASS" && !confirmations.some((c) => c?.policy?.satisfied === true)) {
    throw new ReceiptPersistenceError("SCHEMA_INVALID", "a v3 PASS requires a satisfied blue-score confirmation of the accepting chain block");
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
  assertValidReceiptShape(parsed, "read");
  return { filePath, bytes, receipt: parsed, digest };
}

function bufferEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
