import { domainDigest } from "./domain-digest.js";

// Wave 1.3 · Closure Pack IC-7.4 (respecting IC-1′.5)
//
// `workflowId` is a CORRELATION label with ONE derivation: `wf_` plus the first
// 16 hex of the domain digest of a typed intent. It is never derived from an
// artifact's own hash, and no producer builds the prefix by hand.

/** A root plan's intent: who pays whom, how much, on which network, from which outpoints. */
export interface TransferWorkflowIntent {
  kind: "transfer";
  networkId: string;
  mode: string;
  fromAddress: string;
  toAddress: string;
  amountSompi: string;
  outpoints: Array<{ transactionId: string; index: number }>;
}

/** A declarative workflow's intent: its steps and the environment they were declared under. */
export interface StepsWorkflowIntent {
  kind: "steps";
  steps: unknown[];
  normalizedInputs?: Record<string, unknown>;
  parentArtifacts?: string[];
  policySnapshot?: Record<string, unknown>;
  capabilitySnapshot?: Record<string, unknown>;
  runtimeVersion?: string;
  workspaceSchemaVersion?: string;
}

export type WorkflowIntent = TransferWorkflowIntent | StepsWorkflowIntent;

export const WORKFLOW_ID_PATTERN = /^wf_[0-9a-f]{16}$/;

export class WorkflowIntentInvalidError extends Error {
  readonly code = "WORKFLOW_INTENT_INVALID";
  constructor(message: string) {
    super(`WORKFLOW_INTENT_INVALID: ${message}`);
    this.name = "WorkflowIntentInvalidError";
  }
}

function assertIntent(intent: unknown): asserts intent is WorkflowIntent {
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) {
    throw new WorkflowIntentInvalidError("intent must be an object");
  }
  const kind = (intent as { kind?: unknown }).kind;
  if (kind === "transfer") {
    const t = intent as Partial<TransferWorkflowIntent>;
    for (const field of ["networkId", "mode", "fromAddress", "toAddress", "amountSompi"] as const) {
      if (typeof t[field] !== "string") throw new WorkflowIntentInvalidError(`transfer intent requires string ${field}`);
    }
    if (!Array.isArray(t.outpoints)) throw new WorkflowIntentInvalidError("transfer intent requires outpoints[]");
    return;
  }
  if (kind === "steps") {
    if (!Array.isArray((intent as Partial<StepsWorkflowIntent>).steps)) {
      throw new WorkflowIntentInvalidError("steps intent requires steps[]");
    }
    return;
  }
  throw new WorkflowIntentInvalidError(`unknown intent kind ${JSON.stringify(kind)} (expected "transfer" or "steps")`);
}

/** The single derivation of a workflowId (IC-7.4). */
export function deriveWorkflowId(intent: WorkflowIntent): string {
  assertIntent(intent);
  return `wf_${domainDigest(intent).slice(0, 16)}`;
}
