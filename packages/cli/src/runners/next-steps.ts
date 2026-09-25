// Wave 1.2 · CLI-NEXTSTEPS-1 / Closure Pack IC-5′.11
//
// Every suggestion the CLI prints after a send must be accepted by the resolver in
// the same workspace: `artifactId` is always the canonical identity (the receipt's
// recomputed contentHash) and a txId is labelled as a txId, never passed where an
// artifactId is expected.

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
