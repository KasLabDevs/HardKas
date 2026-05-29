import { formatSompi } from "@hardkas/core";

/**
 * Formats a v2 TxPlan artifact for display.
 */
export function formatTxPlanArtifact(artifact: any): string {
  const lines: string[] = [];

  lines.push("HardKAS Transaction Plan Artifact (v2)");
  lines.push("======================================");
  lines.push(`Plan ID:      ${artifact.planId}`);
  lines.push(`Version:      ${artifact.version}`);
  lines.push(`Hash:         ${artifact.contentHash}`);
  lines.push(`Created:      ${artifact.createdAt}`);
  lines.push("");
  lines.push(`Network:      ${artifact.networkId}`);
  lines.push(`Mode:         ${artifact.mode}`);
  lines.push("");
  lines.push(`From:         ${artifact.from.accountName || artifact.from.address}`);
  lines.push(`To:           ${artifact.to.address}`);
  lines.push(`Amount:       ${formatSompi(BigInt(artifact.amountSompi))}`);
  lines.push("");
  lines.push(`Inputs:       ${artifact.inputs.length}`);
  lines.push(`Outputs:      ${artifact.outputs.length}`);
  lines.push(`Fee:          ${formatSompi(BigInt(artifact.estimatedFeeSompi))}`);
  lines.push(`Mass:         ${artifact.estimatedMass}`);
  lines.push("");
  lines.push("Deterministic Planning Specifications:");
  lines.push("  Coin Selection:");
  lines.push("    deterministic canonical ordering enabled");
  lines.push("  Input Ordering:");
  lines.push("    amountSompi ASC");
  lines.push("    txid ASC");
  lines.push("    index ASC");
  lines.push("  Output Ordering:");
  lines.push("    amountSompi ASC");
  lines.push("    address ASC");

  return lines.join("\n");
}

/**
 * Formats a v2 TxReceipt artifact for display.
 */
export function formatTxReceiptArtifact(artifact: any): string {
  const lines: string[] = [];

  lines.push("HardKAS Transaction Receipt Artifact (v2)");
  lines.push("=========================================");
  lines.push(`Tx ID:        ${artifact.txId}`);
  lines.push(`Status:       ${artifact.status}`);
  lines.push(`Hash:         ${artifact.contentHash}`);
  lines.push("");
  lines.push(`From:         ${artifact.from.address}`);
  lines.push(`To:           ${artifact.to.address}`);
  lines.push(`Amount:       ${formatSompi(BigInt(artifact.amountSompi))}`);
  lines.push(`Fee:          ${formatSompi(BigInt(artifact.feeSompi))}`);

  return lines.join("\n");
}

/**
 * Formats a v2 SignedTx artifact for display.
 */
export function formatSignedTxArtifact(artifact: any): string {
  const lines: string[] = [];

  lines.push("HardKAS Signed Transaction Artifact (v2)");
  lines.push("=========================================");
  lines.push(`Signed ID:    ${artifact.signedId}`);
  lines.push(`Plan ID:      ${artifact.sourcePlanId}`);
  lines.push(`Hash:         ${artifact.contentHash}`);
  lines.push("");
  lines.push(`Network:      ${artifact.networkId}`);
  lines.push(`Mode:         ${artifact.mode}`);
  lines.push(`Status:       ${(artifact.status || "signed").toUpperCase()}`);
  lines.push("");
  lines.push(`From:         ${artifact.from.address}`);
  lines.push(`To:           ${artifact.to.address}`);
  lines.push(`Amount:       ${formatSompi(BigInt(artifact.amountSompi))}`);
  lines.push("");

  if (artifact.signedTransaction) {
    lines.push(`Format:       ${artifact.signedTransaction.format}`);
    lines.push(`Tx ID:        ${artifact.txId || "unknown (pending broadcast)"}`);
  } else if (artifact.multisig) {
    lines.push(
      `Signatures:   ${artifact.multisig.signatures.length} of ${artifact.multisig.threshold} collected`
    );
  }

  return lines.join("\n");
}
