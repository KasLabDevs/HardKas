import { TxPlan, TxReceipt, SignedTx, ARTIFACT_VERSION } from "./schemas.js";
import { calculateContentHash } from "./canonical.js";
import { HARDKAS_VERSION } from "./constants.js";

/**
 * Creates a canonical simulated signed transaction artifact.
 */
export function createSimulatedSignedTxArtifact(plan: TxPlan, payload: string): SignedTx {
  const artifact: SignedTx = {
    schema: "hardkas.signedTx",
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    createdAt: new Date().toISOString(),
    status: "signed",
    signedId: `signed-${Date.now()}`,
    sourcePlanId: plan.planId,
    networkId: plan.networkId,
    mode: plan.mode,
    from: { address: plan.from.address },
    to: { address: plan.to.address },
    amountSompi: plan.amountSompi,
    txId: `simulated-${plan.planId}-${Date.now()}`,
    signedTransaction: {
      format: "simulated",
      payload
    }
  };

  artifact.contentHash = calculateContentHash(artifact);
  return artifact;
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
    daaScore?: string 
  }
): TxReceipt {
  const artifact: TxReceipt = {
    schema: "hardkas.txReceipt",
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
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
    daaScore: extra?.daaScore
  };

  artifact.contentHash = calculateContentHash(artifact);
  return artifact;
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
