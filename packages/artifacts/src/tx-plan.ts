import { TxPlan as TxPlanType } from "@hardkas/tx-builder";
import { TxPlan, ARTIFACT_VERSION } from "./schemas.js";
import { NetworkId, ExecutionMode } from "@hardkas/core";
import { calculateContentHash } from "./canonical.js";
import { HARDKAS_VERSION } from "./constants.js";
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
}

/**
 * Creates a canonical TxPlan artifact from a TxBuilder plan.
 */
export function createTxPlanArtifact(options: CreateTxPlanArtifactOptions): TxPlan {
  const artifact: any = {
    schema: "hardkas.txPlan",
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    createdAt: new Date().toISOString(),
    networkId: options.networkId,
    mode: options.mode,
    planId: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
    inputs: options.plan.inputs.map(i => ({
      outpoint: {
        transactionId: i.outpoint.transactionId,
        index: i.outpoint.index
      },
      amountSompi: i.amountSompi.toString()
    })),
    outputs: options.plan.outputs.map(o => ({
      address: o.address,
      amountSompi: o.amountSompi.toString()
    })),
    rpcUrl: options.rpcUrl
  };

  if (options.plan.change) {
     (artifact as any).change = {
       address: options.plan.change.address,
       amountSompi: options.plan.change.amountSompi.toString()
     };
  }

  artifact.contentHash = calculateContentHash(artifact);
  return artifact as TxPlan;
}
