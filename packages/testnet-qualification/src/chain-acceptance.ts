/**
 * TN10-CONFIRMATION-FIX-1 — the accepting chain block and its blue-score depth.
 *
 * What kaspad serves (verified on TN10, rusty-kaspa 2.1.0): a UTXO row carries the DAA score of the chain block that
 * accepted the transaction, never a block hash; the accepting block is named only by the virtual chain
 * (`getVirtualChainFromBlock` + accepted transaction ids), and confirmations are blue-score depth
 * (`sinkBlueScore − acceptingBlock.blueScore`, the unit of the node's own `minConfirmationCount`).
 *
 * So this stage never reads a hash out of a UTXO row and never counts DAA as confirmations. It:
 *  1. uses a start point captured BEFORE the submission (`captureStartPoint`, the sink at that moment), and
 *  2. asks the caller-bound chain observer — in the product, `sdk.tx.observe(txid, { since })`, the same observer
 *     `hardkas tx status` uses — which chain block accepted the tx and at what blue-score depth, then
 *  3. binds that block to the UTXO row: its DAA score must equal the row's `blockDaaScore`.
 * A transaction is never confirmed here merely because its outputs are in the UTXO set. Whatever cannot be shown
 * stays unresolved; nothing is inferred.
 */

import type { DaaObserverRpc } from "./daa-observer.js";

/** A known chain position recorded before `submitTransaction`; the virtual chain is scanned from it. */
export interface ChainStartPoint {
  readonly sinkHash: string;
  readonly sinkBlueScore: bigint;
  readonly virtualDaaScore: bigint;
  readonly capturedAt: string;
}

/** What one chain look found, normalised from the bound observer (no interpretation). */
export type ChainLookFinding =
  | {
      readonly type: "accepted";
      readonly acceptingBlockHash: string;
      readonly acceptingBlueScore: bigint;
      /** Absent when the observer's finding does not carry it (then the UTXO binding cannot be checked). */
      readonly acceptingDaaScore?: bigint;
      readonly confirmationsBlue: bigint;
      readonly confirmationsDaa?: bigint;
      /** The observer reported the block at or beyond its finality depth. */
      readonly finalityReached: boolean;
    }
  | { readonly type: "mempool" }
  | { readonly type: "not_found"; readonly scannedChainBlocks?: number }
  | { readonly type: "removed"; readonly acceptingBlockHash: string }
  | { readonly type: "unobservable"; readonly reason: string };

export interface ChainLook {
  /** The persisted observation's identity (its contentHash) — the evidence this look stands on. */
  readonly observationArtifactId: string;
  readonly observationPath?: string;
  readonly observedAt: string;
  readonly observerId: string;
  readonly point: { readonly sinkHash: string; readonly sinkBlueScore: bigint; readonly virtualDaaScore: bigint };
  readonly finding: ChainLookFinding;
  /** The state the observer's evidence derives to, under the policy given. */
  readonly derivedStatus: string;
}

/** Caller-supplied bridge into the product observer. TQ never scans the chain itself. */
export interface ChainAcceptanceObserver {
  captureStartPoint(): Promise<ChainStartPoint>;
  /**
   * ONE look: from `since`, which chain block accepts `txid`, at what blue-score depth. Throws with
   * `code = "OBSERVE_SINCE_UNAVAILABLE"` when the node cannot serve the virtual chain from `since` (pruned/unknown).
   */
  look(input: { txid: string; since: string; minConfirmations: bigint }): Promise<ChainLook>;
}

export interface UtxoBinding {
  readonly witnessAddress: string;
  readonly utxoBlockDaaScore?: bigint;
  readonly acceptingDaaScore?: bigint;
  readonly result: "matches" | "mismatch" | "row-missing" | "not-checkable";
}

export interface ChainAcceptanceEvidence {
  readonly txid: string;
  readonly method: "virtual-chain-from-submit-start-point";
  readonly startPoint: ChainStartPoint;
  readonly acceptingBlockHash: string;
  readonly acceptingBlueScore: bigint;
  readonly acceptingDaaScore?: bigint;
  readonly utxoBinding: UtxoBinding;
  readonly look: ChainLook;
}

export interface BlueConfirmationEvidence {
  readonly txid: string;
  readonly acceptingBlockHash: string;
  readonly acceptingBlueScore: bigint;
  readonly sinkBlueScoreAtObservation: bigint;
  readonly confirmationsBlue: bigint;
  /** Informational only — never the confirmation criterion. */
  readonly confirmationsDaa?: bigint;
  readonly observedStatus: string;
  readonly policy: {
    readonly minConfirmations: bigint;
    readonly unit: "blue-score";
    readonly requestedVia: string;
    readonly satisfied: boolean;
  };
  readonly observationArtifactId: string;
  readonly observedAt: string;
  readonly limitations: readonly string[];
}

/** Stated on every confirmation record: what an RPC observation can and cannot establish. */
export const CHAIN_OBSERVATION_LIMITATIONS: readonly string[] = Object.freeze([
  "observed through ONE RPC node; its view of the virtual chain is the only one recorded",
  "blue-score depth at the observation point; acceptance stays revertible until finality",
  "the accepting block was named by the node's virtual chain, not by the UTXO row (which carries only its DAA score)"
]);

export type ChainAcceptanceResult =
  | { readonly kind: "confirmed"; readonly acceptance: ChainAcceptanceEvidence; readonly confirmation: BlueConfirmationEvidence; readonly looks: number }
  | {
      readonly kind: "unresolved";
      readonly code:
        | "ACCEPTANCE_BLOCK_NOT_FOUND"
        | "ACCEPTANCE_CHAIN_UNAVAILABLE"
        | "ACCEPTANCE_UTXO_CONFLICT"
        | "ACCEPTANCE_UTXO_BINDING_UNCHECKABLE"
        | "ACCEPTANCE_REMOVED_FROM_CHAIN"
        | "CONFIRMATION_TIMEOUT"
        | "CHAIN_OBSERVER_ERROR";
      readonly message: string;
      /** The last accepting-block evidence seen, when there was one (never a confirmation). */
      readonly acceptance?: ChainAcceptanceEvidence;
      readonly lastLook?: ChainLook;
      readonly looks: number;
    };

export interface ObserveChainAcceptanceInput {
  readonly txid: string;
  readonly witnessAddress: string;
  readonly startPoint: ChainStartPoint;
  readonly minConfirmations: bigint;
  readonly minConfirmationsRequestedVia: string;
  readonly chainObserver: ChainAcceptanceObserver;
  /** Re-reads the witness UTXO row for the binding (the same RPC the acceptance stage used). */
  readonly observerRpc: Pick<DaaObserverRpc, "getUtxosByAddress">;
}

export interface ObserveChainAcceptanceOptions {
  readonly pollIntervalMs?: number;
  readonly maxWaitMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => Date;
}

function toBig(v: bigint | string | number | undefined): bigint | undefined {
  if (v === undefined) return undefined;
  try {
    return typeof v === "bigint" ? v : BigInt(v);
  } catch {
    return undefined;
  }
}

function codeOf(err: unknown): string | undefined {
  const c = (err as { code?: unknown } | null)?.code;
  return typeof c === "string" ? c : undefined;
}

async function bindToUtxoRow(
  input: ObserveChainAcceptanceInput,
  acceptingDaaScore: bigint | undefined
): Promise<UtxoBinding> {
  const rows = await input.observerRpc.getUtxosByAddress(input.witnessAddress);
  const row = rows.find((r) => r.outpoint.transactionId === input.txid);
  const utxoBlockDaaScore = toBig(row?.blockDaaScore);
  const base = {
    witnessAddress: input.witnessAddress,
    ...(utxoBlockDaaScore !== undefined ? { utxoBlockDaaScore } : {}),
    ...(acceptingDaaScore !== undefined ? { acceptingDaaScore } : {})
  };
  if (!row || utxoBlockDaaScore === undefined) return { ...base, result: "row-missing" };
  if (acceptingDaaScore === undefined) return { ...base, result: "not-checkable" };
  return { ...base, result: utxoBlockDaaScore === acceptingDaaScore ? "matches" : "mismatch" };
}

/**
 * Poll the bound chain observer from the pre-submit start point until the accepting block reaches
 * `minConfirmations` blue-score confirmations (and binds to the UTXO row), or the budget runs out.
 */
export async function observeChainAcceptance(
  input: ObserveChainAcceptanceInput,
  options: ObserveChainAcceptanceOptions = {}
): Promise<ChainAcceptanceResult> {
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const maxWaitMs = options.maxWaitMs ?? 120_000;
  const sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = options.now ?? (() => new Date());
  const deadline = now().getTime() + maxWaitMs;

  let looks = 0;
  let lastLook: ChainLook | undefined;
  let lastAcceptance: ChainAcceptanceEvidence | undefined;
  let lastError: string | undefined;

  const unresolved = (code: Extract<ChainAcceptanceResult, { kind: "unresolved" }>["code"], message: string): ChainAcceptanceResult => ({
    kind: "unresolved",
    code,
    message,
    ...(lastAcceptance ? { acceptance: lastAcceptance } : {}),
    ...(lastLook ? { lastLook } : {}),
    looks
  });

  while (true) {
    let look: ChainLook | undefined;
    try {
      look = await input.chainObserver.look({ txid: input.txid, since: input.startPoint.sinkHash, minConfirmations: input.minConfirmations });
      looks++;
      lastLook = look;
      lastError = undefined;
    } catch (err) {
      looks++;
      const message = err instanceof Error ? err.message : String(err);
      if (codeOf(err) === "OBSERVE_SINCE_UNAVAILABLE") {
        return unresolved(
          "ACCEPTANCE_CHAIN_UNAVAILABLE",
          `the node cannot serve the virtual chain from the pre-submit start point ${input.startPoint.sinkHash}: ${message}. The chain is not inferred.`
        );
      }
      lastError = `${codeOf(err) ?? "CHAIN_OBSERVER_ERROR"}: ${message}`;
    }

    if (look) {
      const f = look.finding;
      if (f.type === "accepted") {
        const binding = await bindToUtxoRow(input, f.acceptingDaaScore);
        lastAcceptance = {
          txid: input.txid,
          method: "virtual-chain-from-submit-start-point",
          startPoint: input.startPoint,
          acceptingBlockHash: f.acceptingBlockHash,
          acceptingBlueScore: f.acceptingBlueScore,
          ...(f.acceptingDaaScore !== undefined ? { acceptingDaaScore: f.acceptingDaaScore } : {}),
          utxoBinding: binding,
          look
        };
        if (binding.result === "mismatch") {
          return unresolved(
            "ACCEPTANCE_UTXO_CONFLICT",
            `the virtual chain names block ${f.acceptingBlockHash} (DAA ${f.acceptingDaaScore}) but the UTXO row on ${input.witnessAddress} carries DAA ${binding.utxoBlockDaaScore}: conflicting evidence, nothing is concluded`
          );
        }
        const satisfied = f.confirmationsBlue >= input.minConfirmations;
        if (satisfied && binding.result === "matches") {
          return {
            kind: "confirmed",
            acceptance: lastAcceptance,
            confirmation: {
              txid: input.txid,
              acceptingBlockHash: f.acceptingBlockHash,
              acceptingBlueScore: f.acceptingBlueScore,
              sinkBlueScoreAtObservation: look.point.sinkBlueScore,
              confirmationsBlue: f.confirmationsBlue,
              ...(f.confirmationsDaa !== undefined ? { confirmationsDaa: f.confirmationsDaa } : {}),
              observedStatus: look.derivedStatus,
              policy: {
                minConfirmations: input.minConfirmations,
                unit: "blue-score",
                requestedVia: input.minConfirmationsRequestedVia,
                satisfied: true
              },
              observationArtifactId: look.observationArtifactId,
              observedAt: look.observedAt,
              limitations: CHAIN_OBSERVATION_LIMITATIONS
            },
            looks
          };
        }
        if (satisfied && binding.result === "not-checkable") {
          return unresolved(
            "ACCEPTANCE_UTXO_BINDING_UNCHECKABLE",
            `block ${f.acceptingBlockHash} has ${f.confirmationsBlue} blue-score confirmations but the observer's finding carries no DAA score, so it cannot be bound to the UTXO row`
          );
        }
        // accepted but not deep enough yet, or the row is not (yet) visible: look again
      }
    }

    if (now().getTime() >= deadline) {
      if (lastAcceptance) {
        const depth = lastLook?.finding.type === "accepted" ? lastLook.finding.confirmationsBlue : undefined;
        if (lastAcceptance.utxoBinding.result === "row-missing") {
          return unresolved(
            "ACCEPTANCE_BLOCK_NOT_FOUND",
            `the virtual chain names block ${lastAcceptance.acceptingBlockHash} but no UTXO row of ${input.txid} is visible on ${input.witnessAddress} to bind it to`
          );
        }
        return unresolved(
          "CONFIRMATION_TIMEOUT",
          `accepted by chain block ${lastAcceptance.acceptingBlockHash} with ${depth ?? "?"} blue-score confirmations, < ${input.minConfirmations} within ${maxWaitMs}ms`
        );
      }
      const f = lastLook?.finding;
      if (f?.type === "removed") {
        return unresolved("ACCEPTANCE_REMOVED_FROM_CHAIN", `the accepting block ${f.acceptingBlockHash} left the observer's selected chain and no new acceptance was observed`);
      }
      if (f?.type === "unobservable") {
        return unresolved("ACCEPTANCE_CHAIN_UNAVAILABLE", `the observer cannot serve the needed chain: ${f.reason}`);
      }
      if (lastError && !lastLook) {
        return unresolved("CHAIN_OBSERVER_ERROR", `no chain look could be taken: ${lastError}`);
      }
      return unresolved(
        "ACCEPTANCE_BLOCK_NOT_FOUND",
        `no chain block accepting ${input.txid} was found on the virtual chain from ${input.startPoint.sinkHash} within ${maxWaitMs}ms (last finding: ${f?.type ?? "none"}). UTXO presence alone is not acceptance-block evidence.`
      );
    }
    await sleep(pollIntervalMs);
  }
}
