/**
 * TQ-1 submission guard — never-blind-resubmit protection.
 *
 * Invariants (agreed 2026-09-15):
 *
 * - The absence of a tx in mempool alone NEVER demonstrates that resubmission
 *   is safe. Any ambiguous submit is resolved via positive observation
 *   (mempool hit or resulting-UTXO hit) or reported as UNRESOLVED. The guard
 *   itself performs AT MOST ONE `submitTransaction` call; it never
 *   auto-retries. Callers deciding to invoke the guard again must consult the
 *   returned `state`.
 *
 * - Confirmation (DAA delta) is NOT resolved here. The guard only answers
 *   "what happened to this submit attempt?"; inclusion + `configuredDaaDelta`
 *   belong to `daa-observer` / the scenario runner. This preserves the
 *   separation you called out in review.
 *
 * State machine (returned as `SubmissionOutcome.state`):
 *
 * - SUBMITTED         RPC accepted the submission on this attempt.
 * - OBSERVED_MEMPOOL  Ambiguous submit; post-probe found the tx in mempool.
 * - OBSERVED_ACCEPTED Ambiguous submit; post-probe found a resulting UTXO
 *                     for this txid at a watched address.
 * - SAFE_TO_RETRY     Server responded with a clear pre-mempool consensus
 *                     rejection (invalid signature, malformed tx, etc.).
 *                     The tx never entered the network under this identity;
 *                     the caller may fix and retry.
 * - UNRESOLVED        Ambiguous submit AND no positive observation within
 *                     the probe budget. The caller MUST NOT retry.
 *
 * TQ1-SCRIPT-BROKEN-1 (D7, review 2026-10-15): once `submitTransaction` has been invoked, the guard always RETURNS an
 * outcome — it never throws the call's error away. An error it cannot classify (any class other than transport /
 * consensus / already-known) is ambiguous: it is resolved by the same independent observation (mempool, then the
 * watched UTXO sets) and ends OBSERVED_* or UNRESOLVED, never retried. A probe that itself fails ends UNRESOLVED.
 * The one thing the guard throws is `SubmissionNotAttemptedError`: the HardKAS client refused BEFORE sending anything
 * (a typed pre-send refusal, `PRE_SEND_REFUSAL_CODES`), so no attempt exists. `attemptOutcomeOf` maps a state to the
 * attempt record of the receipt: accepted / rejected / outcome_unknown (`not_attempted` is the scenario's).
 */

import { classifyError } from "./retry.js";
import type { DaaObserverUtxoRow } from "./daa-observer.js";

export type SubmissionState =
  | "SUBMITTED"
  | "OBSERVED_MEMPOOL"
  | "OBSERVED_ACCEPTED"
  | "SAFE_TO_RETRY"
  | "UNRESOLVED";

export type SubmissionResolvedVia =
  | "first-attempt"
  | "post-ambiguity-mempool-hit"
  | "post-ambiguity-utxo-hit"
  | "consensus-pre-mempool-rejection"
  | "already-known-mempool-hit"
  | "already-known-utxo-hit"
  | "transport-ambiguity-no-positive-observation"
  | "already-known-but-not-observed"
  | "unclassified-error-mempool-hit"
  | "unclassified-error-utxo-hit"
  | "unclassified-error-no-positive-observation"
  | "probe-failed-no-positive-observation";

/**
 * TQ1-SCRIPT-BROKEN-1 (D7): what the receipt records about the one `submitTransaction` call — what the node's ANSWER
 * to that call established, nothing more:
 * - not_attempted   the call was never invoked (attempts 0);
 * - accepted        the node answered with acceptance (SUBMITTED);
 * - rejected        the node answered with an explicit, classifiable rejection (SAFE_TO_RETRY);
 * - outcome_unknown it was invoked and the answer was ambiguous — lost, unclassifiable, "already known" — whatever
 *                   the independent observation found afterwards (OBSERVED_MEMPOOL / OBSERVED_ACCEPTED / UNRESOLVED).
 * Review 2026-10-15 (D7 control): the later observation never rewrites, after the fact, that the answer was
 * ambiguous; it is recorded separately (the guard's state and `resolvedVia`, the acceptance/inclusion slots).
 */
export type SubmissionAttemptOutcome = "not_attempted" | "accepted" | "rejected" | "outcome_unknown";

export function attemptOutcomeOf(state: SubmissionState): Exclude<SubmissionAttemptOutcome, "not_attempted"> {
  switch (state) {
    case "SUBMITTED":
      return "accepted";
    case "SAFE_TO_RETRY":
      return "rejected";
    case "OBSERVED_MEMPOOL":
    case "OBSERVED_ACCEPTED":
    case "UNRESOLVED":
      return "outcome_unknown";
  }
}

/**
 * Typed refusals the HardKAS RPC client raises BEFORE a request leaves the process: no endpoint chosen
 * (NETWORK_ENDPOINT_REQUIRED), a node that does not serve the expected network (NODE_NETWORK_*, verified before the
 * request), a storage-mass commitment it will not send (RPC_STORAGE_MASS_*), a node of the mainnet type identified
 * right before the broadcast (MAINNET_BROADCAST_DISABLED, MAINNET-PERIMETER-1).
 */
export const PRE_SEND_REFUSAL_CODES: ReadonlySet<string> = new Set([
  "NETWORK_ENDPOINT_REQUIRED",
  "NODE_NETWORK_MISMATCH",
  "NODE_NETWORK_UNKNOWN",
  "MAINNET_BROADCAST_DISABLED",
  "RPC_STORAGE_MASS_INVALID",
  "RPC_STORAGE_MASS_CONFLICT",
  "RPC_STORAGE_MASS_MISSING"
]);

/** The client refused before sending: `submitTransaction` was never invoked on the node. Carries the client's code. */
export class SubmissionNotAttemptedError extends Error {
  readonly code: string;
  readonly cause: unknown;
  constructor(code: string, cause: unknown) {
    super(`submitTransaction was not sent: the client refused first (${code}): ${messageOf(cause)}`);
    this.name = "SubmissionNotAttemptedError";
    this.code = code;
    this.cause = cause;
  }
}

export interface SubmissionOutcome {
  readonly state: SubmissionState;
  readonly txid: string;
  readonly attempts: 1; // guard is single-attempt by construction
  readonly resolvedVia: SubmissionResolvedVia;
  /**
   * When the outcome derives from an RPC error, the raw error is included
   * for evidence. Redaction happens downstream via the receipt redactor.
   */
  readonly lastError?: unknown;
  /** Present on OBSERVED_ACCEPTED — the address on which the UTXO was hit. */
  readonly witnessAddress?: string;
  /** ISO timestamp of the moment the state was resolved. */
  readonly resolvedAt: string;
}

export interface SubmissionGuardRpc {
  submitTransaction(signedTx: unknown): Promise<{ transactionId?: string }>;
  getMempoolEntry(txid: string): Promise<{ txid: string } | null>;
  getUtxosByAddress(address: string): Promise<readonly DaaObserverUtxoRow[]>;
}

export interface SubmissionGuardInput {
  readonly rpc: SubmissionGuardRpc;
  readonly signedTx: unknown;
  /**
   * Caller-computed txid. Required — the guard must know what to probe for,
   * and cannot rely on the RPC return value being present after transport
   * failure. In HardKAS this is the deterministic tx identity from the
   * signed artifact (KASPA_WASM_GENERATOR output).
   */
  readonly txid: string;
  /**
   * Addresses whose UTXO set may witness the tx's outputs (recipient,
   * change). The probe checks each; a hit on any of them proves inclusion
   * without needing a tx-lookup RPC.
   */
  readonly watchAddresses: readonly string[];
}

export interface SubmissionGuardOptions {
  /** Time to wait after an ambiguous submit before the first probe round. */
  readonly probeWaitBeforeMs?: number;
  /** Total probe budget after the first wait. */
  readonly probeMaxWaitMs?: number;
  /** Interval between probe rounds. */
  readonly probePollIntervalMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => Date;
}

const ALREADY_KNOWN_PATTERNS = [
  /already (?:known|in mempool|accepted)/i,
  /duplicate/i,
  /transaction is already/i,
  // P0-TX-SAFETY-1A: rusty-kaspa v2.1.0's own texts (RejectDuplicate, RejectDuplicateOrphan), wrapped as
  // "Rejected transaction <id>: transaction <id> is already in the mempool". Missed before, they fell to the consensus
  // class ("rejected", "orphan") and the guard answered SAFE_TO_RETRY for a transaction the node holds.
  /\bis already in the (?:mempool|orphan pool)\b/i
];

function messageOf(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const anyErr = err as { message?: unknown };
    if (typeof anyErr.message === "string") return anyErr.message;
  }
  try { return String(err); } catch { return ""; }
}

function isAlreadyKnown(err: unknown): boolean {
  const msg = messageOf(err);
  return ALREADY_KNOWN_PATTERNS.some((r) => r.test(msg));
}

async function probeForTx(
  rpc: SubmissionGuardRpc,
  txid: string,
  watchAddresses: readonly string[]
): Promise<
  | { hit: "mempool" }
  | { hit: "utxo"; witnessAddress: string }
  | { hit: "none" }
> {
  const mempool = await rpc.getMempoolEntry(txid);
  if (mempool !== null) return { hit: "mempool" };
  for (const address of watchAddresses) {
    const utxos = await rpc.getUtxosByAddress(address);
    if (utxos.some((u) => u.outpoint.transactionId === txid)) {
      return { hit: "utxo", witnessAddress: address };
    }
  }
  return { hit: "none" };
}

/**
 * Submit a signed tx with never-blind-resubmit semantics. Performs AT MOST
 * ONE `submitTransaction` call. On ambiguity, probes network state and
 * classifies the outcome per the state machine documented above.
 */
export async function submitWithAmbiguityGuard(
  input: SubmissionGuardInput,
  options: SubmissionGuardOptions = {}
): Promise<SubmissionOutcome> {
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const probeWaitBeforeMs = options.probeWaitBeforeMs ?? 500;
  const probeMaxWaitMs = options.probeMaxWaitMs ?? 5000;
  const probePollIntervalMs = options.probePollIntervalMs ?? 500;

  let submitError: unknown;
  try {
    const result = await input.rpc.submitTransaction(input.signedTx);
    const txid = result.transactionId ?? input.txid;
    return {
      state: "SUBMITTED",
      txid,
      attempts: 1,
      resolvedVia: "first-attempt",
      resolvedAt: now().toISOString()
    };
  } catch (err) {
    submitError = err;
  }

  // D7: a typed refusal of the client itself, before anything was sent — no attempt exists.
  const preSendCode =
    submitError && typeof submitError === "object" && typeof (submitError as { code?: unknown }).code === "string"
      ? ((submitError as { code: string }).code)
      : undefined;
  if (preSendCode !== undefined && PRE_SEND_REFUSAL_CODES.has(preSendCode)) {
    throw new SubmissionNotAttemptedError(preSendCode, submitError);
  }

  const cls = classifyError(submitError);

  // Ambiguity paths — probe before deciding.
  const probeAmbiguous = async (
    onHit: (hit: "mempool" | "utxo") => SubmissionResolvedVia,
    onMiss: SubmissionResolvedVia,
    stateOnMiss: SubmissionState
  ): Promise<SubmissionOutcome> => {
    await sleep(probeWaitBeforeMs);
    const deadline = now().getTime() + probeMaxWaitMs;
    while (true) {
      let probe: Awaited<ReturnType<typeof probeForTx>>;
      try {
        probe = await probeForTx(input.rpc, input.txid, input.watchAddresses);
      } catch {
        // D7: the call was made; an observation that cannot be taken proves nothing either way
        return {
          state: "UNRESOLVED",
          txid: input.txid,
          attempts: 1,
          resolvedVia: "probe-failed-no-positive-observation",
          lastError: submitError,
          resolvedAt: now().toISOString()
        };
      }
      if (probe.hit === "mempool") {
        return {
          state: "OBSERVED_MEMPOOL",
          txid: input.txid,
          attempts: 1,
          resolvedVia: onHit("mempool"),
          lastError: submitError,
          resolvedAt: now().toISOString()
        };
      }
      if (probe.hit === "utxo") {
        return {
          state: "OBSERVED_ACCEPTED",
          txid: input.txid,
          attempts: 1,
          resolvedVia: onHit("utxo"),
          lastError: submitError,
          witnessAddress: probe.witnessAddress,
          resolvedAt: now().toISOString()
        };
      }
      if (now().getTime() >= deadline) {
        return {
          state: stateOnMiss,
          txid: input.txid,
          attempts: 1,
          resolvedVia: onMiss,
          lastError: submitError,
          resolvedAt: now().toISOString()
        };
      }
      await sleep(probePollIntervalMs);
    }
  };

  // Case A: "already known" / "duplicate" — server tells us the tx exists.
  // Probe for the positive hit; if it somehow isn't observable, report
  // `already-known-but-not-observed` (still UNRESOLVED — never resubmit).
  if (isAlreadyKnown(submitError)) {
    return probeAmbiguous(
      (hit) => hit === "mempool" ? "already-known-mempool-hit" : "already-known-utxo-hit",
      "already-known-but-not-observed",
      "UNRESOLVED"
    );
  }

  // Case B: Transport ambiguity — probe.
  if (cls === "transport") {
    return probeAmbiguous(
      (hit) => hit === "mempool" ? "post-ambiguity-mempool-hit" : "post-ambiguity-utxo-hit",
      "transport-ambiguity-no-positive-observation",
      "UNRESOLVED"
    );
  }

  // Case C: Clear consensus rejection pre-mempool → SAFE_TO_RETRY.
  // The tx was validated and rejected by the node; it never entered any
  // resulting state. The caller may fix and retry with a new tx identity.
  if (cls === "consensus") {
    return {
      state: "SAFE_TO_RETRY",
      txid: input.txid,
      attempts: 1,
      resolvedVia: "consensus-pre-mempool-rejection",
      lastError: submitError,
      resolvedAt: now().toISOString()
    };
  }

  // Case D: Every other classification (network-mismatch / unsynced /
  // missing-capability / unknown) after the call was made. TQ1-SCRIPT-BROKEN-1 (D7): the node received the call and
  // answered something the guard cannot classify — the outcome is unknown, not "nothing happened". Resolve it by
  // observation like any other ambiguity; never retry.
  return probeAmbiguous(
    (hit) => hit === "mempool" ? "unclassified-error-mempool-hit" : "unclassified-error-utxo-hit",
    "unclassified-error-no-positive-observation",
    "UNRESOLVED"
  );
}
