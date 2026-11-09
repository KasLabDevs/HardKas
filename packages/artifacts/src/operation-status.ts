import type { CovenantTransitionFact, ZkVerificationFact } from "./schemas.js";
import type { DerivedTxStatus } from "./tx-status.js";

export type CovenantStatusKind =
  | "PROPOSED"
  | "MEMPOOL_PENDING"
  /** Accepted by the node's virtual chain; the confirmation policy has not been met yet (ZK-10 pattern). */
  | "TRANSITION_ACCEPTED"
  | "TRANSITION_CONFIRMED"
  /** Executed by the simulator or the script VM only: no L1 observation, nothing advanced on L1. */
  | "TRANSITION_SYNTHETIC_ONLY"
  | "TRANSITION_REJECTED"
  | "TRANSITION_REORGED"
  | "TERMINATED"
  | "CONFLICTED"
  | "INCONCLUSIVE";

export interface CovenantStatusResult {
  readonly kind: CovenantStatusKind;
  readonly covenantId: string;
  readonly activeOutpoint?: string | undefined;
  readonly currentState?: Readonly<Record<string, unknown>> | undefined;
  readonly txStatus?: DerivedTxStatus | undefined;
  readonly reason: string;
  readonly isFinal: boolean;
}

/**
 * Pure function deriving high-level covenant state from immutable facts and derived L1 transaction status.
 * Evaluates state progression, successor outpoint activation, reorg rollbacks, and termination.
 */
export function deriveCovenantStatus(params: {
  readonly transitionFact: CovenantTransitionFact;
  readonly txStatus?: DerivedTxStatus | undefined;
  readonly isTerminated?: boolean | undefined;
}): CovenantStatusResult {
  const { transitionFact: fact, txStatus } = params;
  const isTerminated = Boolean(params.isTerminated || !fact.nextState);
  const outpoint = fact.spentOutpoint as { transactionId: string; index: number };
  const outpointKey = `${outpoint.transactionId}:${outpoint.index}`;

  if (!txStatus) {
    return {
      kind: "PROPOSED",
      covenantId: String(fact.covenantId),
      activeOutpoint: outpointKey,
      currentState: fact.previousState as Readonly<Record<string, unknown>> | undefined,
      reason: "Transition fact created, awaiting network submission and observation",
      isFinal: false
    };
  }

  switch (txStatus.status) {
    case "REJECTED_BY_NODE":
      return {
        kind: "TRANSITION_REJECTED",
        covenantId: String(fact.covenantId),
        activeOutpoint: outpointKey,
        currentState: fact.previousState as Readonly<Record<string, unknown>> | undefined,
        txStatus,
        reason: "Transition transaction was rejected by node consensus or policy",
        isFinal: true
      };

    case "REORGED":
      return {
        kind: "TRANSITION_REORGED",
        covenantId: String(fact.covenantId),
        activeOutpoint: outpointKey,
        currentState: fact.previousState as Readonly<Record<string, unknown>> | undefined,
        txStatus,
        reason: "Transition transaction was reorged out of the selected chain; prior state reinstated",
        isFinal: false
      };

    case "CONFLICTING_OBSERVATIONS":
      return {
        kind: "CONFLICTED",
        covenantId: String(fact.covenantId),
        txStatus,
        reason: "Conflicting observations received from nodes; state transition in doubt",
        isFinal: false
      };

    case "MEMPOOL_ACCEPTED":
    case "MEMPOOL_ORPHAN":
    case "SUBMITTED":
      return {
        kind: "MEMPOOL_PENDING",
        covenantId: String(fact.covenantId),
        currentState: fact.previousState as Readonly<Record<string, unknown>> | undefined,
        txStatus,
        reason: "Transition transaction in mempool or submitted, awaiting DAG block inclusion",
        isFinal: false
      };

    case "ACCEPTED":
    case "CONFIRMED":
    case "FINALIZED":
    case "SYNTHETIC_EXECUTED": {
      const succ = fact.successorOutpoint as { transactionId: string; index: number } | undefined;
      const successor = succ
        ? `${succ.transactionId}:${succ.index}`
        : `${fact.txId}:0`;
      // ZK-10 pattern (covenants): a synthetic execution is never an L1 outcome, and an accepted transaction is not yet
      // a confirmed one. Only CONFIRMED / FINALIZED report TRANSITION_CONFIRMED (or TERMINATED).
      if (txStatus.status === "SYNTHETIC_EXECUTED") {
        return {
          kind: "TRANSITION_SYNTHETIC_ONLY",
          covenantId: String(fact.covenantId),
          ...(isTerminated ? {} : { activeOutpoint: successor }),
          currentState: (isTerminated ? fact.previousState : fact.nextState) as Readonly<Record<string, unknown>> | undefined,
          txStatus,
          reason: isTerminated
            ? "Termination executed by the simulator or the script VM only; not observed on L1"
            : `Transition executed by the simulator or the script VM only; not observed on L1 (simulated successor ${successor})`,
          isFinal: false
        };
      }
      if (txStatus.status === "ACCEPTED") {
        return {
          kind: "TRANSITION_ACCEPTED",
          covenantId: String(fact.covenantId),
          ...(isTerminated ? {} : { activeOutpoint: successor }),
          currentState: (isTerminated ? fact.previousState : fact.nextState) as Readonly<Record<string, unknown>> | undefined,
          txStatus,
          reason: isTerminated
            ? "Termination accepted by the node's virtual chain; not yet confirmed by the confirmation policy"
            : `Transition accepted by the node's virtual chain; not yet confirmed by the confirmation policy (successor UTXO ${successor})`,
          isFinal: false
        };
      }
      if (isTerminated) {
        return {
          kind: "TERMINATED",
          covenantId: String(fact.covenantId),
          currentState: fact.previousState as Readonly<Record<string, unknown>> | undefined,
          txStatus,
          reason: "Covenant concluded/terminated; all funds transitioned or spent without continuation",
          isFinal: txStatus.status === "FINALIZED"
        };
      }
      return {
        kind: "TRANSITION_CONFIRMED",
        covenantId: String(fact.covenantId),
        activeOutpoint: successor,
        currentState: fact.nextState as Readonly<Record<string, unknown>> | undefined,
        txStatus,
        reason: `Transition confirmed on L1; state advanced to successor UTXO ${successor}`,
        isFinal: txStatus.status === "FINALIZED"
      };
    }

    default:
      return {
        kind: "INCONCLUSIVE",
        covenantId: String(fact.covenantId),
        txStatus,
        reason: `Transaction status is ${txStatus.status}; covenant outcome not yet determinable`,
        isFinal: false
      };
  }
}

export type ZkOperationStatusKind =
  | "PROOF_PREPARED"
  /** HardKAS's own verifier verified the proof off-chain; the transaction is not observed yet. */
  | "PROOF_VERIFIED_OFFCHAIN"
  /** No off-chain verification was performed (the default): not a failure, the node's precompile decides. */
  | "PROOF_NOT_VERIFIED_OFFCHAIN"
  /** A local verifier REJECTED the proof (only when the fact says so explicitly). */
  | "PROOF_VERIFICATION_FAILED"
  | "TX_SUBMITTED"
  /** Accepted by the node's virtual chain (the precompile verified the proof); not yet confirmed. */
  | "TX_ACCEPTED"
  /** Confirmed (or finalized) on L1 under the confirmation policy. */
  | "SETTLED"
  /** A synthetic (simulator) execution: never L1 settlement. */
  | "SYNTHETIC_ONLY"
  | "TX_REJECTED"
  | "TX_REORGED"
  | "INCONCLUSIVE";

export interface ZkOperationStatusResult {
  readonly kind: ZkOperationStatusKind;
  readonly imageId: string;
  readonly journalHash: string;
  readonly txId: string;
  readonly payoutAddress: string;
  readonly payoutSompi: string;
  readonly txStatus?: DerivedTxStatus | undefined;
  readonly reason: string;
  readonly isFinal: boolean;
}

/**
 * Pure function deriving end-to-end ZK operation lifecycle state from
 * cryptographic facts and L1 transaction confirmation status.
 * Distinguishes local mathematical proof verification from consensus settlement.
 *
 * The transaction status, when known, takes precedence: an accepted spend means the node's
 * OpZkPrecompile verified the proof, whatever was (or was not) checked off-chain. Without a transaction
 * status, an off-chain verification that was never performed is PROOF_NOT_VERIFIED_OFFCHAIN (not final),
 * never a definitive failure (HK-17). Only consensus finality is final.
 */
export function deriveZkOperationStatus(params: {
  readonly zkFact: ZkVerificationFact;
  readonly txStatus?: DerivedTxStatus | undefined;
}): ZkOperationStatusResult {
  const { zkFact: fact, txStatus } = params;
  const offChain: "VERIFIED" | "NOT_PERFORMED" | "FAILED" =
    (fact as any).offChainVerification === "FAILED"
      ? "FAILED"
      : fact.verifiedOffChain === true
        ? "VERIFIED"
        : "NOT_PERFORMED";
  const offChainNote =
    offChain === "VERIFIED"
      ? "off-chain verification passed"
      : offChain === "FAILED"
        ? "the local off-chain verification FAILED"
        : "no off-chain verification was performed";
  const base = {
    imageId: String(fact.imageId),
    journalHash: String(fact.journalHash),
    txId: String(fact.txId),
    payoutAddress: String(fact.payoutAddress),
    payoutSompi: String(fact.payoutSompi)
  };

  if (!txStatus) {
    if (offChain === "VERIFIED") {
      return {
        kind: "PROOF_VERIFIED_OFFCHAIN",
        ...base,
        reason: "Off-chain Groth16 BN254 mathematical verification passed; transaction prepared but unobserved",
        isFinal: false
      };
    }
    if (offChain === "FAILED") {
      return {
        kind: "PROOF_VERIFICATION_FAILED",
        ...base,
        reason: "The local off-chain Groth16 verification rejected the provided proof and journal; transaction unobserved",
        isFinal: false
      };
    }
    return {
      kind: "PROOF_NOT_VERIFIED_OFFCHAIN",
      ...base,
      reason:
        "No off-chain verification was performed by HardKAS; only the node's OpZkPrecompile decides. Transaction prepared but unobserved",
      isFinal: false
    };
  }

  switch (txStatus.status) {
    case "REJECTED_BY_NODE":
      return {
        kind: "TX_REJECTED",
        ...base,
        txStatus,
        reason: "ZK spend transaction was rejected by rusty-kaspad consensus or precompile check",
        isFinal: true
      };

    case "REORGED":
      return {
        kind: "TX_REORGED",
        ...base,
        txStatus,
        reason: "ZK spend transaction was removed by a DAG reorganization",
        isFinal: false
      };

    case "SUBMITTED":
    case "MEMPOOL_ACCEPTED":
    case "MEMPOOL_ORPHAN":
      return {
        kind: "TX_SUBMITTED",
        ...base,
        txStatus,
        reason: `ZK spend transaction received by node / mempool, waiting for block inclusion (${offChainNote})`,
        isFinal: false
      };

    case "ACCEPTED":
      return {
        kind: "TX_ACCEPTED",
        ...base,
        txStatus,
        reason: `ZK spend accepted by the node's virtual chain (its OpZkPrecompile verified the proof; ${offChainNote}); not yet confirmed under the confirmation policy`,
        isFinal: false
      };

    case "CONFIRMED":
    case "FINALIZED":
      return {
        kind: "SETTLED",
        ...base,
        txStatus,
        reason: `ZK spend ${txStatus.status === "FINALIZED" ? "finalized" : "confirmed"} on L1; payout of ${fact.payoutSompi} sompi to ${fact.payoutAddress}`,
        isFinal: txStatus.status === "FINALIZED"
      };

    case "SYNTHETIC_EXECUTED":
      return {
        kind: "SYNTHETIC_ONLY",
        ...base,
        txStatus,
        reason: "Synthetic execution (simulator namespace): not settlement, and no node verified the proof",
        isFinal: false
      };

    default:
      return {
        kind: "INCONCLUSIVE",
        ...base,
        txStatus,
        reason: `Transaction observation kind is ${txStatus.status}; settlement inconclusive`,
        isFinal: false
      };
  }
}
