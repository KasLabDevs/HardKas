import { HardkasSchemas } from "@hardkas/artifacts";

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
    if (result.accepted === true) {
      return `Submitted to the node; the node accepted txId ${txId}. No observation recorded (the status is derived from observations, not stored).`;
    }
    const reason = typeof result.error === "string" && result.error.length > 0 ? `: ${result.error}` : "";
    return `Submitted to the node; the node rejected the transaction (txId ${txId})${reason}. No observation recorded.`;
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
