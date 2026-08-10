import {
  ExecutionModeMismatchError,
  ExecutionDomainMismatchError,
  ExecutionNetworkMismatchError,
} from "./compatibility-errors.js";
import type { HardkasExecutionTarget } from "../index.js";

// We use structural interfaces so @hardkas/core doesn't need to depend on concrete types 
// from higher-level packages like @hardkas/accounts or @hardkas/artifacts.

export interface ExecutionAwareAccount {
  kind: string;
  network?: string;
  executionMode?: string;
}

export interface ExecutionAwareArtifact {
  execution?: HardkasExecutionTarget;
}

export interface ExecutionAwareReceipt {
  execution?: HardkasExecutionTarget;
}

export type ExecutionOperation = "fund" | "plan" | "sign" | "simulate" | "send" | "replay";

export interface ExecutionCompatibilityInput {
  target: HardkasExecutionTarget;
  account?: ExecutionAwareAccount;
  artifact?: ExecutionAwareArtifact;
  receipt?: ExecutionAwareReceipt;
  operation: ExecutionOperation;
}

export function assertAccountCompatibleWithTarget(account: ExecutionAwareAccount, target: HardkasExecutionTarget): void {
  // Domain mismatch
  if (target.domain === "evm-l2") {
    // Unconditional failure for EVM L2 as Kaspa accounts don't port over automatically
    throw new ExecutionDomainMismatchError(`Domain 'evm-l2' is strictly isolated. Account kind '${account.kind}' cannot operate in this domain.`);
  }

  if (target.mode === "simulator") {
    if (account.kind !== "synthetic") {
      throw new ExecutionModeMismatchError(`Simulator targets require 'synthetic' accounts, got '${account.kind}'.`);
    }
  } else if (target.mode === "localnet") {
    if (account.kind !== "kaspa") {
      throw new ExecutionModeMismatchError(`Localnet targets require 'kaspa' accounts, got '${account.kind}'.`);
    }
    if (account.network !== target.network) {
      throw new ExecutionNetworkMismatchError(`Account network '${account.network || "undefined"}' does not match target network '${target.network}'.`);
    }
  } else if (target.mode === "rpc") {
    if (account.kind === "synthetic") {
      throw new ExecutionModeMismatchError(`RPC targets cannot interact with 'synthetic' accounts.`);
    }
    if (account.network !== target.network) {
      throw new ExecutionNetworkMismatchError(`Account network '${account.network || "undefined"}' does not match target network '${target.network}'.`);
    }
  }
}

export function assertArtifactCompatibleWithTarget(artifact: ExecutionAwareArtifact, target: HardkasExecutionTarget): void {
  if (!artifact.execution) {
    // Legacy V1/V2 artifacts won't have this. We allow them to pass the guard.
    return;
  }
  
  if (artifact.execution.domain !== target.domain) {
    throw new ExecutionDomainMismatchError(`Artifact domain '${artifact.execution.domain}' does not match target domain '${target.domain}'.`);
  }
  
  if (artifact.execution.mode !== target.mode) {
    throw new ExecutionModeMismatchError(`Artifact mode '${artifact.execution.mode}' does not match target mode '${target.mode}'.`);
  }
  
  if (artifact.execution.network !== target.network) {
    throw new ExecutionNetworkMismatchError(`Artifact network '${artifact.execution.network}' does not match target network '${target.network}'.`);
  }
}

export function assertReceiptCompatibleWithTarget(receipt: ExecutionAwareReceipt, target: HardkasExecutionTarget): void {
  if (!receipt.execution) return;

  if (receipt.execution.domain !== target.domain) {
    throw new ExecutionDomainMismatchError(`Receipt domain '${receipt.execution.domain}' does not match target domain '${target.domain}'.`);
  }

  if (receipt.execution.mode !== target.mode) {
    throw new ExecutionModeMismatchError(`Receipt mode '${receipt.execution.mode}' does not match target mode '${target.mode}'.`);
  }

  if (receipt.execution.network !== target.network) {
    throw new ExecutionNetworkMismatchError(`Receipt network '${receipt.execution.network}' does not match target network '${target.network}'.`);
  }
}

export function assertArtifactAccountCompatibility(artifact: ExecutionAwareArtifact, account: ExecutionAwareAccount): void {
  if (!artifact.execution) return;

  if (artifact.execution.mode === "simulator") {
    if (account.kind !== "synthetic") {
      throw new ExecutionModeMismatchError(`Simulator artifact requires 'synthetic' account, got '${account.kind}'.`);
    }
  } else if (artifact.execution.mode === "localnet" || artifact.execution.mode === "rpc") {
    if (account.kind === "synthetic") {
      throw new ExecutionModeMismatchError(`Artifact for ${artifact.execution.mode} cannot be processed by a 'synthetic' account.`);
    }
    if (account.network && artifact.execution.network && account.network !== artifact.execution.network) {
      throw new ExecutionNetworkMismatchError(`Account network '${account.network}' does not match artifact network '${artifact.execution.network}'.`);
    }
  }
}

export function assertExecutionCompatibility(input: ExecutionCompatibilityInput): void {
  const { target, account, artifact, receipt } = input;
  
  if (account) assertAccountCompatibleWithTarget(account, target);
  if (artifact) assertArtifactCompatibleWithTarget(artifact, target);
  if (receipt) assertReceiptCompatibleWithTarget(receipt, target);
  if (artifact && account) assertArtifactAccountCompatibility(artifact, account);
}
