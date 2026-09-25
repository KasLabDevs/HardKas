import { HardkasSchemas } from "@hardkas/artifacts";

// Wave 1.2 · AUD-45: `why` narrates what the artifact records, computed from its real
// fields. Nothing is invented: an unobserved block is reported as not observed.

export function describeWhyNode(artifact: any): string | undefined {
  const schema = typeof artifact?.schema === "string" ? artifact.schema : "";
  if (schema.startsWith(HardkasSchemas.SignedTx) && artifact.signatures && typeof artifact.signatures === "object") {
    return `Signed by ${Object.keys(artifact.signatures).join(", ")}`;
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
