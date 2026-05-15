import { TxPlan, TxReceipt, SignedTx, ARTIFACT_VERSION, DagContext } from "./schemas.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "./canonical.js";
import { HARDKAS_VERSION } from "./constants.js";

/**
 * Creates a canonical simulated signed transaction artifact.
 */
export function createSimulatedSignedTxArtifact(plan: TxPlan, payload: string): SignedTx {
  const artifact: any = {
    schema: "hardkas.signedTx",
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: new Date().toISOString(),
    status: "signed",
    sourcePlanId: plan.planId,
    networkId: plan.networkId,
    mode: plan.mode,
    from: { address: plan.from.address },
    to: { address: plan.to.address },
    amountSompi: plan.amountSompi,
    signedTransaction: {
      format: "simulated",
      payload
    }
  };

  const hash = calculateContentHash(artifact, CURRENT_HASH_VERSION);
  artifact.signedId = `signed-${hash.slice(0, 16)}`;
  artifact.txId = `simulated-${plan.planId}-${hash.slice(0, 8)}`;
  artifact.contentHash = hash;

  return artifact as SignedTx;
}

/**
 * Creates a canonical simulated receipt.
 */
export function createSimulatedTxReceipt(
  plan: TxPlan, 
  txId: string, 
  extra?: { 
    spentUtxoIds?: string[], 
    createdUtxoIds?: string[], 
    daaScore?: string,
    preStateHash?: string,
    postStateHash?: string,
    dagContext?: DagContext
  }
): TxReceipt {
  const artifact: any = {
    schema: "hardkas.txReceipt",
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: new Date().toISOString(),
    txId,
    status: "accepted",
    mode: "simulated",
    networkId: plan.networkId,
    from: { address: plan.from.address },
    to: { address: plan.to.address },
    amountSompi: plan.amountSompi,
    feeSompi: plan.estimatedFeeSompi,
    changeSompi: (plan as any).change?.amountSompi,
    spentUtxoIds: extra?.spentUtxoIds,
    createdUtxoIds: extra?.createdUtxoIds,
    daaScore: extra?.daaScore,
    preStateHash: extra?.preStateHash,
    postStateHash: extra?.postStateHash,
    dagContext: extra?.dagContext
  };

  const hash = calculateContentHash(artifact, CURRENT_HASH_VERSION);
  artifact.contentHash = hash;

  return artifact as TxReceipt;
}

/**
 * Validates and extracts the raw transaction from a signed artifact.
 */
export function getBroadcastableSignedTransaction(artifact: any): {
  mode: string;
  rawTransaction: string;
} {
  if (!artifact.signedTransaction?.payload) {
    throw new Error("Signed artifact is missing the raw transaction payload.");
  }

  return {
    mode: artifact.mode || "rpc",
    rawTransaction: artifact.signedTransaction.payload
  };
}
