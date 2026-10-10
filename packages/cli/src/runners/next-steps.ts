// Wave 1.2 · CLI-NEXTSTEPS-1 / Closure Pack IC-5′.11
//
// Every suggestion the CLI prints after a send must be accepted by the resolver in
// the same workspace: `artifactId` is always the canonical identity (the receipt's
// recomputed contentHash) and a txId is labelled as a txId, never passed where an
// artifactId is expected.
//
// Wave 1.3 · R-iii part 1 / IC-2′.8 / IC-4′.4: the OUTCOME of a send is decided
// from a submission's authenticated submit result, or from a FULL-scope receipt's
// status. A legacy (hashVersion ≤ 4) or unverifiable status decides nothing.

import { checkArtifactIdentity, CURRENT_HASH_VERSION, HardkasSchemas, submitOutcomeOf } from "@hardkas/artifacts";
import type { LedgerFailureEffect } from "@hardkas/core";

const ARTIFACT_ID_PATTERN = /^[0-9a-f]{64}$/;

export interface SendOutcomeReceipt {
  contentHash?: string | undefined;
  lineage?: { artifactId?: string | undefined } | null | undefined;
}

export interface SendOutcome {
  receipt?: SendOutcomeReceipt | undefined;
  txId?: string | undefined;
  workspace?: string | undefined;
}

/** The receipt's canonical identity, or undefined when the receipt carries none. */
export function receiptArtifactId(receipt: SendOutcome["receipt"]): string | undefined {
  const id = receipt?.contentHash ?? receipt?.lineage?.artifactId;
  return typeof id === "string" && ARTIFACT_ID_PATTERN.test(id) ? id : undefined;
}

/** Commands that explain the receipt just produced; each resolves in this workspace. */
export function nextStepsAfterSend(outcome: SendOutcome): string[] {
  const id = receiptArtifactId(outcome.receipt);
  if (!id) return [];
  const ws = outcome.workspace ? ` --workspace ${outcome.workspace}` : "";
  return [`hardkas explain ${id}${ws}`, `hardkas why ${id}${ws}`];
}

/** The `explanation` block of the JSON output: canonical identity plus the txId, labelled. */
export function sendExplanation(outcome: SendOutcome): { available: boolean; artifactId?: string; txId?: string } {
  const id = receiptArtifactId(outcome.receipt);
  return {
    available: id !== undefined,
    ...(id !== undefined ? { artifactId: id } : {}),
    ...(typeof outcome.txId === "string" ? { txId: outcome.txId } : {})
  };
}

export type SendArtifactOutcome =
  | { kind: "submission"; accepted: boolean; decided: boolean; authScope: "FULL" | "LEGACY" | "NONE" }
  | { kind: "receipt"; accepted: boolean; decided: boolean; authScope: "FULL" | "LEGACY" | "NONE"; status: string | undefined }
  | { kind: "unknown"; accepted: false; decided: false; authScope: "NONE" };

/**
 * What the artifact a send produced says about the outcome, and whether that
 * says anything at all. `decided` is true only when the deciding field is
 * authenticated: a submission's `submitResult` or a hashVersion-5 receipt's
 * `status`. `accepted` is false whenever nothing was decided.
 */
export function sendOutcome(artifact: any): SendArtifactOutcome {
  const schema = typeof artifact?.schema === "string" ? artifact.schema : "";
  const identity = checkArtifactIdentity(artifact);
  const authScope: "FULL" | "LEGACY" | "NONE" = identity.ok
    ? artifact.hashVersion === CURRENT_HASH_VERSION
      ? "FULL"
      : "LEGACY"
    : "NONE";
  const decided = authScope === "FULL";
  if (schema === HardkasSchemas.TxSubmissionV1) {
    return { kind: "submission", accepted: decided && artifact?.submitResult?.accepted === true, decided, authScope };
  }
  if (schema.startsWith(HardkasSchemas.TxReceipt)) {
    const status = typeof artifact?.status === "string" ? artifact.status : undefined;
    const accepted = decided && (status === "accepted" || status === "confirmed" || status === "submitted");
    return { kind: "receipt", accepted, decided, authScope, status };
  }
  return { kind: "unknown", accepted: false, decided: false, authScope: "NONE" };
}

/**
 * EVENT-LEDGER-2 final closeout (decision 2) · the `outcome` a `tx send` reports for a send that ran: AUX-11's
 * `submitted` / `rejected`, and `unknown` for a submission whose submit call failed without an answer from the node —
 * which may have received it, so it is never reported as rejected.
 */
export function sendOutcomeLabel(artifact: any, accepted: boolean): "submitted" | "rejected" | "unknown" {
  if (accepted) return "submitted";
  if (artifact?.schema === HardkasSchemas.TxSubmissionV1 && submitOutcomeOf(artifact?.submitResult) === "unknown") return "unknown";
  return "rejected";
}

/** The CLI failure for a send that ran and was not accepted: the node's rejection, or an unknown outcome. */
export function notAcceptedFailure(artifact: any, txId: string | undefined): { code: string; title: string; message: string } {
  const id = receiptArtifactId(artifact) ?? "unknown";
  const reason = typeof artifact?.submitResult?.error === "string" ? artifact.submitResult.error : undefined;
  if (sendOutcomeLabel(artifact, false) === "unknown") {
    const tx = txId && ARTIFACT_ID_PATTERN.test(txId) ? txId : undefined;
    return {
      code: "TX_SUBMISSION_OUTCOME_UNKNOWN",
      title: "Submission outcome UNKNOWN: the node may have received the transaction",
      message:
        `The outcome of the submission is unknown: the submit call failed without an answer from the node (${reason ?? "no answer"}), ` +
        `which may have received the transaction. The attempt was recorded as ${id}; check the transaction` +
        `${tx ? ` ('hardkas tx status ${tx}')` : ""} before sending it again.`
    };
  }
  return {
    code: "TX_SUBMISSION_REJECTED",
    title: "Transaction NOT accepted by the node",
    message: `The node did not accept the transaction (${reason ?? "no reason returned"}); the submission was recorded as ${id}.`
  };
}

/**
 * EVENT-LEDGER-2 final closeout (A1) · the AUX-11 `outcome` of a `tx send` whose ledger failed, from what its send step
 * had done: submitted (the node accepted the submission request, or the simulator executed it), rejected, unknown, or
 * failed (nothing was sent or executed).
 */
export function outcomeOfEffect(effect: LedgerFailureEffect | undefined): "submitted" | "rejected" | "unknown" | "failed" {
  if (!effect || effect.outcome === "not-performed") return "failed";
  if (effect.outcome === "accepted" || effect.outcome === "executed") return "submitted";
  return effect.outcome;
}

/** A short phrase for what a send step had done, for a failure that came after it. */
export function effectSummary(effect: LedgerFailureEffect): string {
  const tx = effect.txId ? `transaction ${effect.txId}` : "the transaction";
  switch (effect.outcome) {
    case "accepted":
      return `the node accepted the submission of ${tx}: RPC acceptance of the request, not acceptance in the DAG`;
    case "rejected":
      return `the node rejected ${tx}`;
    case "unknown":
      return `the outcome of sending ${tx} is unknown: the node may have received it`;
    case "executed":
      return `the simulator executed ${tx}`;
    case "not-performed":
      return "nothing was sent or executed";
  }
}
