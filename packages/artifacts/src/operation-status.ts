import type { CovenantTransitionFact, ZkVerificationFact } from "./schemas.js";
import type { DerivedTxStatus } from "./tx-status.js";

export type CovenantStatusKind =
  | "PROPOSED"
  | "MEMPOOL_PENDING"
  | "TRANSITION_CONFIRMED"
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
      const succ = fact.successorOutpoint as { transactionId: string; index: number } | undefined;
      const successor = succ
        ? `${succ.transactionId}:${succ.index}`
        : `${fact.txId}:0`;
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
  | "PROOF_VERIFIED_OFFCHAIN"
  | "PROOF_VERIFICATION_FAILED"
  | "TX_SUBMITTED"
  | "SETTLED"
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
 */
export function deriveZkOperationStatus(params: {
  readonly zkFact: ZkVerificationFact;
  readonly txStatus?: DerivedTxStatus | undefined;
}): ZkOperationStatusResult {
  const { zkFact: fact, txStatus } = params;

  if (!fact.verifiedOffChain) {
    return {
      kind: "PROOF_VERIFICATION_FAILED",
      imageId: String(fact.imageId),
      journalHash: String(fact.journalHash),
      txId: String(fact.txId),
      payoutAddress: String(fact.payoutAddress),
      payoutSompi: String(fact.payoutSompi),
      txStatus,
      reason: "Mathematical off-chain Groth16 verification failed for the provided proof and journal",
      isFinal: true
    };
  }

  if (!txStatus) {
    return {
      kind: "PROOF_VERIFIED_OFFCHAIN",
      imageId: String(fact.imageId),
      journalHash: String(fact.journalHash),
      txId: String(fact.txId),
      payoutAddress: String(fact.payoutAddress),
      payoutSompi: String(fact.payoutSompi),
      reason: "Off-chain Groth16 BN254 mathematical verification passed; transaction prepared but unobserved",
      isFinal: false
    };
  }

  switch (txStatus.status) {
    case "REJECTED_BY_NODE":
      return {
        kind: "TX_REJECTED",
        imageId: String(fact.imageId),
        journalHash: String(fact.journalHash),
        txId: String(fact.txId),
        payoutAddress: String(fact.payoutAddress),
        payoutSompi: String(fact.payoutSompi),
        txStatus,
        reason: "ZK spend transaction was rejected by rusty-kaspad consensus or precompile check",
        isFinal: true
      };

    case "REORGED":
      return {
        kind: "TX_REORGED",
        imageId: String(fact.imageId),
        journalHash: String(fact.journalHash),
        txId: String(fact.txId),
        payoutAddress: String(fact.payoutAddress),
        payoutSompi: String(fact.payoutSompi),
        txStatus,
        reason: "ZK spend transaction was removed by a DAG reorganization",
        isFinal: false
      };

    case "SUBMITTED":
    case "MEMPOOL_ACCEPTED":
    case "MEMPOOL_ORPHAN":
      return {
        kind: "TX_SUBMITTED",
        imageId: String(fact.imageId),
        journalHash: String(fact.journalHash),
        txId: String(fact.txId),
        payoutAddress: String(fact.payoutAddress),
        payoutSompi: String(fact.payoutSompi),
        txStatus,
        reason: "ZK spend transaction received by node / mempool, waiting for block inclusion",
        isFinal: false
      };

    case "ACCEPTED":
    case "CONFIRMED":
    case "FINALIZED":
    case "SYNTHETIC_EXECUTED":
      return {
        kind: "SETTLED",
        imageId: String(fact.imageId),
        journalHash: String(fact.journalHash),
        txId: String(fact.txId),
        payoutAddress: String(fact.payoutAddress),
        payoutSompi: String(fact.payoutSompi),
        txStatus,
        reason: `ZK spend confirmed on L1; payout of ${fact.payoutSompi} sompi delivered to ${fact.payoutAddress}`,
        isFinal: txStatus.status === "FINALIZED"
      };

    default:
      return {
        kind: "INCONCLUSIVE",
        imageId: String(fact.imageId),
        journalHash: String(fact.journalHash),
        txId: String(fact.txId),
        payoutAddress: String(fact.payoutAddress),
        payoutSompi: String(fact.payoutSompi),
        txStatus,
        reason: `Transaction observation kind is ${txStatus.status}; settlement inconclusive`,
        isFinal: false
      };
  }
}
