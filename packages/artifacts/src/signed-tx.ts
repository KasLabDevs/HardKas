import {
  TxPlan,
  TxReceipt,
  SignedTx,
  ARTIFACT_VERSION,
  DagContext,
  DraftArtifact
} from "./schemas.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "./canonical.js";
import { createLineageTransition } from "./lineage.js";
import { HARDKAS_VERSION } from "./constants.js";
import type { RuntimeContext } from "@hardkas/core";

/**
 * Creates a canonical simulated signed transaction artifact.
 */
export function createSimulatedSignedTxArtifact(
  plan: TxPlan,
  payload: string,
  ctx: RuntimeContext
): SignedTx {
  const artifact: DraftArtifact<SignedTx, "signedId" | "contentHash"> = {
    schema: "hardkas.signedTx",
    schemaVersion: "hardkas.artifact.v1",
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: new Date(ctx.clock.now()).toISOString(),
    status: "signed",
    sourcePlanId: plan.planId,
    networkId: plan.networkId,
    mode: plan.mode,
    from: { address: plan.from.address },
    to: { address: plan.to.address },
    amountSompi: plan.amountSompi,
    txId: `simulated-${plan.planId}-tx`,
    signedTransaction: {
      format: "simulated",
      payload
    },
    lineage: createLineageTransition(plan, "hardkas.signedTx"),
    ...(plan.workflowId ? { workflowId: plan.workflowId } : {}),
    ...(plan.assumptionLevel ? { assumptionLevel: plan.assumptionLevel } : {})
  };

  const hash = calculateContentHash(artifact, CURRENT_HASH_VERSION);
  artifact.signedId = `signed-${hash.slice(0, 16)}`;
  artifact.contentHash = hash;
  if (artifact.lineage) {
    artifact.lineage.artifactId = hash;
  }

  return artifact as SignedTx;
}

/**
 * Creates a canonical simulated receipt.
 */
export function createSimulatedTxReceipt(
  plan: TxPlan,
  txId: string,
  ctx: RuntimeContext,
  extra?: {
    spentUtxoIds?: string[];
    createdUtxoIds?: string[];
    daaScore?: string;
    preStateHash?: string;
    postStateHash?: string;
    dagContext?: DagContext;
  }
): TxReceipt {
  const artifact: DraftArtifact<TxReceipt, "contentHash"> = {
    schema: "hardkas.txReceipt",
    schemaVersion: "hardkas.receipt.v1",
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: new Date(ctx.clock.now()).toISOString(),
    txId,
    status: "accepted",
    mode: "simulated",
    networkId: plan.networkId,
    from: { address: plan.from.address },
    to: { address: plan.to.address },
    amountSompi: plan.amountSompi,
    feeSompi: plan.estimatedFeeSompi,
    changeSompi: plan.change?.amountSompi,
    spentUtxoIds: extra?.spentUtxoIds,
    createdUtxoIds: extra?.createdUtxoIds,
    daaScore: extra?.daaScore,
    preStateHash: extra?.preStateHash,
    postStateHash: extra?.postStateHash,
    dagContext: extra?.dagContext,
    lineage: createLineageTransition(plan, "hardkas.txReceipt"),
    ...(plan.workflowId ? { workflowId: plan.workflowId } : {}),
    ...(plan.assumptionLevel ? { assumptionLevel: plan.assumptionLevel } : {})
  };

  if (artifact.lineage) {
    artifact.lineage.parentArtifactId = extra?.preStateHash || txId.replace("simulated-", "").replace("-tx", "").padEnd(64, '0').slice(0, 64);
  }
  const hash = calculateContentHash(artifact, CURRENT_HASH_VERSION);
  artifact.contentHash = hash;
  if (artifact.lineage) {
    artifact.lineage.artifactId = hash; // receipt uses contentHash as artifactId
  }

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
