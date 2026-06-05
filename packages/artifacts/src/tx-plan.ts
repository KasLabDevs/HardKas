import { TxPlan as TxPlanType } from "@hardkas/tx-builder";
import { TxPlan, ARTIFACT_VERSION, DraftArtifact } from "./schemas.js";
import { NetworkId, ExecutionMode } from "@hardkas/core";
import { calculateContentHash, CURRENT_HASH_VERSION } from "./canonical.js";
import { HARDKAS_VERSION } from "./constants.js";
import type { RuntimeContext } from "@hardkas/core";
import { formatSompi } from "@hardkas/core";

export interface CreateTxPlanArtifactOptions {
  networkId: NetworkId;
  mode: ExecutionMode;
  from: {
    input: string;
    address: string;
    accountName?: string;
  };
  to: {
    input: string;
    address: string;
  };
  amountSompi: bigint;
  plan: TxPlanType;
  rpcUrl?: string;
  ctx: RuntimeContext;
}

/**
 * Creates a canonical TxPlan artifact from a TxBuilder plan.
 */
export function createTxPlanArtifact(options: CreateTxPlanArtifactOptions): TxPlan {
  const artifact: DraftArtifact<TxPlan, "planId" | "contentHash"> = {
    schema: "hardkas.txPlan",
    hardkasVersion: HARDKAS_VERSION,
    schemaVersion: "hardkas.artifact.v1",
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: new Date(options.ctx.clock.now()).toISOString(),
    networkId: options.networkId,
    mode: options.mode,
    from: {
      address: options.from.address,
      accountName: options.from.accountName,
      input: options.from.input
    },
    to: {
      address: options.to.address,
      input: options.to.input
    },
    amountSompi: options.amountSompi.toString(),
    estimatedFeeSompi: options.plan.estimatedFeeSompi.toString(),
    estimatedMass: options.plan.estimatedMass.toString(),
    inputs: options.plan.inputs.map((i) => ({
      outpoint: {
        transactionId: i.outpoint.transactionId,
        index: i.outpoint.index
      },
      amountSompi: i.amountSompi.toString(),
      address: i.address,
      scriptPublicKey: i.scriptPublicKey,
      ...(i.blockDaaScore !== undefined ? { blockDaaScore: i.blockDaaScore.toString() } : {}),
      ...(i.isCoinbase !== undefined ? { isCoinbase: i.isCoinbase } : {})
    })),
    outputs: options.plan.outputs.map((o) => ({
      address: o.address,
      amountSompi: o.amountSompi.toString()
    })),
    rpcUrl: options.rpcUrl,
    lineage: {
      artifactId: "",
      lineageId: "0".repeat(64), // placeholder, will be replaced if empty
      parentArtifactId: "",
      rootArtifactId: "",
      sequence: 1
    },
    ...(options.ctx.workflowId ? { workflowId: options.ctx.workflowId } : {})
  };

  if (options.plan.change) {
    artifact.change = {
      address: options.plan.change.address,
      amountSompi: options.plan.change.amountSompi.toString()
    };
  }

  const hash = calculateContentHash(artifact, CURRENT_HASH_VERSION);
  artifact.planId = `plan-${hash.slice(0, 16)}`;
  artifact.contentHash = hash;
  
  if (artifact.lineage) {
    // For a root plan, rootArtifactId = contentHash (the artifact's own identity).
    // Since lineage is included in hash computation, we use the contentHash as the
    // canonical self-reference. Set lineageId/parentArtifactId to empty sentinels 
    // during hashing, then fix them to contentHash.
    artifact.lineage.lineageId = hash;
    artifact.lineage.parentArtifactId = hash;
    artifact.lineage.rootArtifactId = hash;
    artifact.lineage.artifactId = hash;
    
    // Recalculate with the first-pass lineage values
    const finalHash = calculateContentHash(artifact, CURRENT_HASH_VERSION);
    artifact.planId = `plan-${finalHash.slice(0, 16)}`;
    artifact.contentHash = finalHash;
    artifact.lineage.artifactId = finalHash;
    // rootArtifactId stays as the original `hash` — this is the canonical lineage root.
    // All children inherit this value via createLineageTransition.
  }

  return artifact as TxPlan;
}
