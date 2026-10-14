import { HardkasSchemas, submitOutcomeOf } from "@hardkas/artifacts";

// Wave 1.2 · AUD-45: `why` narrates what the artifact records, computed from its real
// fields. Nothing is invented: an unobserved block is reported as not observed.
// Wave 1.3 · R-iii part 1: a submission narrates what HardKAS did (the node's
// answer to the submit call); it records no observation.

export function describeWhyNode(artifact: any): string | undefined {
  const schema = typeof artifact?.schema === "string" ? artifact.schema : "";
  if (schema.startsWith(HardkasSchemas.SignedTx) && artifact.signatures && typeof artifact.signatures === "object") {
    return `Signed by ${Object.keys(artifact.signatures).join(", ")}`;
  }
  if (schema === HardkasSchemas.TxSubmissionV1) {
    const result = artifact?.submitResult ?? {};
    const txId = typeof artifact?.txId === "string" ? artifact.txId : "unknown";
    const error = typeof result.error === "string" && result.error.length > 0 ? result.error : undefined;
    // EVENT-LEDGER-2 final closeout: what the submit result establishes — the node's acceptance of the submission
    // request (not acceptance in the DAG), its rejection, or an unknown outcome (a call that failed without an answer)
    switch (submitOutcomeOf(result)) {
      case "accepted":
        return `Submitted to the node; the node accepted the submission request for txId ${txId} (not acceptance or confirmation in the DAG). No observation recorded (the status is derived from observations, not stored).`;
      case "unknown":
        return `Submission attempted (txId ${txId}); its outcome is unknown: the submit call failed without an answer from the node${error ? ` (${error})` : ""}, which may have received it. No observation recorded.`;
      case "rejected":
        return `Submitted to the node; the node rejected the transaction (txId ${txId})${error ? `: ${error}` : ""}. No observation recorded.`;
    }
  }
  if (schema.startsWith(HardkasSchemas.TxReceipt)) {
    const block = artifact?.dagContext?.acceptingBlockHash ?? artifact?.blockHash;
    if (typeof block === "string" && block.length > 0) return `Included in block ${block}`;
    return artifact?.mode === "simulator" ? "Block not observed (simulated execution)" : "Block not observed";
  }
  if (schema.startsWith(HardkasSchemas.TxPlan)) {
    const outputs = Array.isArray(artifact?.outputs) ? artifact.outputs.length : 0;
    return `Transfers to ${outputs} outputs`;
  }
  if (schema.startsWith(HardkasSchemas.ReplayV1)) {
    return `Verified: ${artifact.status}`;
  }
  return undefined;
}
