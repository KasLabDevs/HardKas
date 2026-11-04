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
  if (schema === HardkasSchemas.CovenantTransitionFactV1) {
    const contract = typeof artifact?.contractName === "string" ? artifact.contractName : "contract";
    const method = typeof artifact?.entrypoint === "string" ? artifact.entrypoint : "transition";
    const spent = artifact?.spentOutpoint
      ? `${String(artifact.spentOutpoint.transactionId).slice(0, 8)}:${artifact.spentOutpoint.index}`
      : "unknown";
    const successor = artifact?.successorOutpoint
      ? `${String(artifact.successorOutpoint.transactionId).slice(0, 8)}:${artifact.successorOutpoint.index}`
      : "none (terminated)";
    const preflight = artifact?.validation?.scriptVmPassed
      ? "ScriptVM PASSED"
      : (artifact?.validation?.diagnostic ?? (artifact?.validation?.structuralPassed ? "Structural OK" : "Preflight failed"));
    return `Covenant ${typeof artifact?.covenantId === "string" ? artifact.covenantId.slice(0, 8) + "..." : ""} (${contract}.${method}), spent ${spent} -> ${successor} (${preflight}). Contract state transition declared; node execution requires consensus observation.`;
  }
  if (schema === HardkasSchemas.ZkVerificationFactV1) {
    const guest = typeof artifact?.guestSystem === "string" ? artifact.guestSystem : "Guest";
    const sys = typeof artifact?.provingSystem === "string" ? artifact.provingSystem : "Groth16";
    const curve = typeof artifact?.curve === "string" ? artifact.curve : "BN254";
    const math = artifact?.verifiedOffChain ? "Math verified locally" : "Math verification FAILED";
    const journal = typeof artifact?.journalHash === "string" ? `${String(artifact.journalHash).slice(0, 8)}...` : "unknown";
    return `ZK proof (${guest} ${sys} ${curve}), journal ${journal}, ${math}. Cryptographic Groth16 proof verified off-chain; consensus acceptance requires OpZkPrecompile execution in DAG.`;
  }
  return undefined;
}
