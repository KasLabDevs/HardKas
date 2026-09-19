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
import { HardkasSchemas } from "@hardkas/core";

/**
 * Creates a canonical simulated signed transaction artifact.
 */
export function createSimulatedSignedTxArtifact(
  plan: TxPlan,
  payload: string,
  ctx: RuntimeContext
): SignedTx {
  const artifact: DraftArtifact<SignedTx, "signedId" | "contentHash"> = {
    schema: HardkasSchemas.SignedTx,
    schemaVersion: HardkasSchemas.ArtifactV1,
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
    lineage: createLineageTransition(plan, HardkasSchemas.SignedTx),
    execution: plan.execution || { mode: plan.mode as any, domain: "kaspa-l1", network: plan.networkId },
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
 *
 * DEF-1c (Wave 1 continuation): the receipt's `lineage.parentArtifactId` MUST
 * be an artifact hash (per the lineage contract). Previously, this function
 * overrode `parentArtifactId` with `preStateHash` — a state-machine hash from a
 * DIFFERENT hash space — which caused every persisted simulator receipt to
 * declare an unresolvable HardKAS parent. `preStateHash` and `postStateHash`
 * remain first-class execution/state evidence fields on the receipt; they are
 * never interpreted as artifact IDs.
 *
 * The `extra` bag also now accepts schema-owned lifecycle fields (already
 * declared on `TxReceiptSchema` — `submittedAt`, `confirmedAt`, `rpcUrl`,
 * `tracePath`, `sourceSignedId`) so callers can populate the single canonical
 * receipt identity in one construction, rather than building a second wrapper
 * receipt with its own contentHash. Optional `parentArtifact` overrides the
 * lineage predecessor when the caller executed/submitted a signed artifact
 * rather than a plan (the plan remains referenced via `sourceSignedId` →
 * signed.sourcePlanId indirection preserved by the signed artifact).
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
    // Schema-owned lifecycle metadata (see TxReceiptSchema):
    submittedAt?: string;
    confirmedAt?: string;
    rpcUrl?: string;
    tracePath?: string;
    sourceSignedId?: string;
    // Lineage predecessor override (used when the caller executed a signed
    // artifact and the correct DAG parent is the signed, not the plan). The
    // object must carry contentHash + optional lineage for root propagation.
    parentArtifact?: { contentHash: string; lineage?: any };
  }
): TxReceipt {
  const lineagePredecessor = extra?.parentArtifact ?? (plan as any);
  const artifact: DraftArtifact<TxReceipt, "contentHash"> = {
    schema: HardkasSchemas.TxReceipt,
    schemaVersion: HardkasSchemas.TxReceiptV1,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: new Date(ctx.clock.now()).toISOString(),
    txId,
    status: "accepted",
    mode: "simulator",
    networkId: plan.networkId,
    from: { address: plan.from.address },
    to: { address: plan.to.address },
    amountSompi: plan.amountSompi,
    feeSompi: plan.estimatedFeeSompi,
    mass: plan.estimatedMass,
    changeSompi: plan.change?.amountSompi,
    spentUtxoIds: extra?.spentUtxoIds,
    createdUtxoIds: extra?.createdUtxoIds,
    daaScore: extra?.daaScore,
    preStateHash: extra?.preStateHash,
    postStateHash: extra?.postStateHash,
    dagContext: extra?.dagContext,
    lineage: createLineageTransition(lineagePredecessor, HardkasSchemas.TxReceipt),
    execution: plan.execution || { mode: plan.mode as any, domain: "kaspa-l1", network: plan.networkId },
    ...(plan.workflowId ? { workflowId: plan.workflowId } : {}),
    ...(plan.assumptionLevel ? { assumptionLevel: plan.assumptionLevel } : {}),
    ...(extra?.submittedAt ? { submittedAt: extra.submittedAt } : {}),
    ...(extra?.confirmedAt ? { confirmedAt: extra.confirmedAt } : {}),
    ...(extra?.rpcUrl ? { rpcUrl: extra.rpcUrl } : {}),
    ...(extra?.tracePath ? { tracePath: extra.tracePath } : {}),
    ...(extra?.sourceSignedId ? { sourceSignedId: extra.sourceSignedId } : {})
  };

  const hash = calculateContentHash(artifact, CURRENT_HASH_VERSION);
  artifact.contentHash = hash;
  if (artifact.lineage) {
    artifact.lineage.artifactId = hash; // receipt uses contentHash as artifactId
  }

  // Preserve VULN-03 immutability contract: the canonical receipt is frozen
  // at construction so no downstream consumer can silently mutate its
  // identity after hashing. Freezing here (rather than in the SDK wrapper)
  // is what keeps DEF-1c's single-identity invariant intact — a mutable
  // wrapper elsewhere could otherwise re-fork the receipt.
  return Object.freeze(artifact) as TxReceipt;
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
