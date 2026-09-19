import {
  ExecutionModeMismatchError,
  ExecutionDomainMismatchError,
  ExecutionNetworkMismatchError,
  ExecutionCompatibilityUndefinedError
} from "./compatibility-errors.js";
import type { HardkasExecutionTarget } from "../index.js";
import { classifyExecutionCompatibility, type ExecutionOperation } from "./compatibility.js";

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

export type { ExecutionOperation };

export interface ExecutionCompatibilityInput {
  target: HardkasExecutionTarget;
  account?: ExecutionAwareAccount;
  artifact?: ExecutionAwareArtifact;
  receipt?: ExecutionAwareReceipt;
  operation: ExecutionOperation;
}

/**
 * Operations where the passed account is the RECIPIENT of a transfer.
 * Recipients do not need to be able to sign; they only need to be a valid
 * destination on the correct network under the target's execution backend.
 * (See Wave 3 DEF-15 investigation report for the semantic decomposition of
 * `identity`, `signing authority`, and `execution backend`.)
 */
const RECIPIENT_OPERATIONS: readonly ExecutionOperation[] = ["fund"] as const;

function isRecipientOperation(operation: ExecutionOperation): boolean {
  return (RECIPIENT_OPERATIONS as readonly string[]).includes(operation);
}

/**
 * Assert that `account` is a compatible participant in `operation` executed
 * against `target`.
 *
 * DEF-15 (Wave 3): the guard is now operation-aware. `operation` is mandatory
 * — the outer `assertExecutionCompatibility` boundary already requires it, and
 * dropping it here silently reintroduced signer-authority rules on recipients.
 * Optional-with-default would perpetuate the exact class of defect we're
 * removing; mandatory forces every future caller to make an explicit choice.
 *
 * Signer/source operations (`sign`, `dev-reveal`, `dev-export`, and any future
 * operation NOT listed in RECIPIENT_OPERATIONS): the account must hold signing
 * authority on the target's execution world, so the existing mode/kind checks
 * apply verbatim. `external-wallet` is intentionally rejected here because
 * HardKAS cannot sign for it.
 *
 * Recipient operations (currently `fund`): the account only needs to be a
 * valid destination address on the target network. `external-wallet` is
 * accepted because the funder (the miner) provides authority, not the
 * recipient. `synthetic` recipients remain forbidden under real localnet/rpc
 * targets (per docs/migrations/0.11-to-0.12.md §5) — the fix does NOT
 * generalize `fund` into "accept every account kind".
 *
 * Account.kind is READ ONLY here; no mutation occurs during compatibility
 * checking (regression H).
 */
export function assertAccountCompatibleWithTarget(
  account: ExecutionAwareAccount,
  target: HardkasExecutionTarget,
  operation: ExecutionOperation
): void {
  // Domain mismatch — applies to every operation.
  if (target.domain === "evm-l2") {
    // Unconditional failure for EVM L2 as Kaspa accounts don't port over automatically
    throw new ExecutionDomainMismatchError({ expected: "kaspa-l1", actual: "evm-l2", message: `Domain 'evm-l2' is strictly isolated. Account kind '${account.kind}' cannot operate in this domain.` });
  }

  if (isRecipientOperation(operation)) {
    // Recipient rules (Wave 3 DEF-15). Signing authority is NOT required.
    // Network compatibility still IS required — a wrong-network address would
    // be an irrecoverable send.
    if (target.mode === "simulator") {
      // Simulator recipients must be synthetic — a raw kaspasim: address under
      // the simulator target is preserved as invalid (regression F), matching
      // pre-Wave-3 behavior. Only kaspa:sim_<name> synthetic identities are
      // valid simulator recipients.
      if (account.kind !== "synthetic") {
        throw new ExecutionModeMismatchError({ expected: "synthetic", actual: account.kind });
      }
    } else if (target.mode === "localnet" || target.mode === "rpc") {
      // Real Kaspa targets: synthetic accounts remain rejected (documented).
      // Both HardKAS-owned kaspa accounts and external-wallet recipients are
      // accepted — the recipient does not sign the funding transaction, so
      // whether HardKAS holds the private key is irrelevant to this guard.
      if (account.kind === "synthetic") {
        throw new ExecutionModeMismatchError({ expected: "kaspa", actual: account.kind });
      }
      if (account.network && account.network !== target.network) {
        throw new ExecutionNetworkMismatchError({ expected: target.network, actual: account.network });
      }
    }
    return;
  }

  // Signer/source operations — retain existing signing-authority semantics
  // verbatim so this fix does NOT accidentally weaken any other guard.
  if (target.mode === "simulator") {
    if (account.kind !== "synthetic") {
      throw new ExecutionModeMismatchError({ expected: "synthetic", actual: account.kind });
    }
  } else if (target.mode === "localnet") {
    if (account.kind !== "kaspa") {
      throw new ExecutionModeMismatchError({ expected: "kaspa", actual: account.kind });
    }
    if (account.network !== target.network) {
      throw new ExecutionNetworkMismatchError({ expected: target.network, actual: account.network || "undefined" });
    }
  } else if (target.mode === "rpc") {
    if (account.kind === "synthetic") {
      throw new ExecutionModeMismatchError({ expected: "kaspa", actual: account.kind });
    }
    if (account.network !== target.network) {
      throw new ExecutionNetworkMismatchError({ expected: target.network, actual: account.network || "undefined" });
    }
  }
}

export function assertArtifactCompatibleWithTarget(artifact: ExecutionAwareArtifact, target: HardkasExecutionTarget, operation?: ExecutionOperation): void {
  if (!artifact.execution) {
    // Legacy V1/V2 artifacts won't have this. We allow them to pass the guard.
    return;
  }

  const classification = classifyExecutionCompatibility(artifact.execution, target, operation);

  if (classification === "incompatible") {
    if (artifact.execution.domain !== target.domain) {
      throw new ExecutionDomainMismatchError({ expected: target.domain, actual: artifact.execution.domain });
    }
    if (artifact.execution.network !== target.network) {
      throw new ExecutionNetworkMismatchError({ expected: target.network, actual: artifact.execution.network });
    }
    if (artifact.execution.mode !== target.mode) {
      throw new ExecutionModeMismatchError({ expected: target.mode, actual: artifact.execution.mode });
    }
  }

  if (classification === "undefined") {
    throw new ExecutionCompatibilityUndefinedError({
      artifactExecution: artifact.execution,
      target,
      operation
    });
  }
}

export function assertReceiptCompatibleWithTarget(receipt: ExecutionAwareReceipt, target: HardkasExecutionTarget, operation?: ExecutionOperation): void {
  if (!receipt.execution) return;

  const classification = classifyExecutionCompatibility(receipt.execution, target, operation);

  if (classification === "incompatible") {
    if (receipt.execution.domain !== target.domain) {
      throw new ExecutionDomainMismatchError({ expected: target.domain, actual: receipt.execution.domain });
    }
    if (receipt.execution.network !== target.network) {
      throw new ExecutionNetworkMismatchError({ expected: target.network, actual: receipt.execution.network });
    }
    if (receipt.execution.mode !== target.mode) {
      throw new ExecutionModeMismatchError({ expected: target.mode, actual: receipt.execution.mode });
    }
  }

  if (classification === "undefined") {
    throw new ExecutionCompatibilityUndefinedError({
      receiptExecution: receipt.execution,
      target,
      operation
    });
  }
}

export function assertArtifactAccountCompatibility(artifact: ExecutionAwareArtifact, account: ExecutionAwareAccount): void {
  if (!artifact.execution) return;

  if (artifact.execution.mode === "simulator") {
    if (account.kind !== "synthetic") {
      throw new ExecutionModeMismatchError({ expected: "synthetic", actual: account.kind });
    }
  } else if (artifact.execution.mode === "localnet" || artifact.execution.mode === "rpc") {
    if (account.kind === "synthetic") {
      throw new ExecutionModeMismatchError({ expected: "kaspa", actual: account.kind });
    }
    if (account.network && artifact.execution.network && account.network !== artifact.execution.network) {
      throw new ExecutionNetworkMismatchError({ expected: artifact.execution.network, actual: account.network });
    }
  }
}

export function assertExecutionCompatibility(input: ExecutionCompatibilityInput): void {
  const { target, account, artifact, receipt, operation } = input;

  // DEF-15: thread `operation` explicitly into the account guard so recipient
  // operations (`fund`) don't inherit signer-authority requirements.
  if (account) assertAccountCompatibleWithTarget(account, target, operation);
  if (artifact) assertArtifactCompatibleWithTarget(artifact, target, operation);
  if (receipt) assertReceiptCompatibleWithTarget(receipt, target, operation);
  if (artifact && account) assertArtifactAccountCompatibility(artifact, account);
}
