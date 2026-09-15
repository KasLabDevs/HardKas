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
  | "already-known-but-not-observed";

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
  /transaction is already/i
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
      const probe = await probeForTx(input.rpc, input.txid, input.watchAddresses);
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
  // missing-capability / unknown) is not a submission-guard concern. Re-throw
  // so the runner records it against the appropriate authority instead.
  throw submitError;
}
