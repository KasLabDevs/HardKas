import { ProjectArtifactStore } from "@hardkas/artifacts";
import { formatSompiToKas } from "@hardkas/core";

export interface TxReceiptRunnerInput {
  txId: string;
  cwd?: string;
}

export interface TxReceiptRunnerResult {
  receipt: any;
  formatted: string;
}

export async function runTxReceipt(
  input: TxReceiptRunnerInput
): Promise<TxReceiptRunnerResult> {
  const { txId, cwd } = input;

  const root = cwd || process.cwd();
  const store = new ProjectArtifactStore(root);
  let receipt: any;
  try {
    receipt = await store.findReceiptByTxId(txId);
  } catch (e: any) {
    // STAGE-B-2 · C4: still no receipt (a receipt records a submission, and none is invented), but when the workspace
    // holds observations of the tx the refusal says so and where to look. Same code; any other error is unchanged.
    if (e?.code !== "RECEIPT_NOT_FOUND") throw e;
    const { receiptNotFoundMessage } = await import("./observed-tx.js");
    const message = receiptNotFoundMessage(txId, root, String(e.message));
    if (message === e.message) throw e;
    const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
    throw new HardkasCliError("RECEIPT_NOT_FOUND", message, { exitCode: HardkasExitCode.RUNTIME_FAILURE, cause: e });
  }

  const lines = [
    "Transaction receipt",
    "",
    `Tx ID:     ${receipt.txId}`,
    `Mode:      ${receipt.mode || "unknown"}`,
    `Network:   ${receipt.networkId || "unknown"}`,
    `From:      ${receipt.from?.address || "unknown"}`,
    `To:        ${receipt.to?.address || "unknown"}`,
    `Amount:    ${receipt.amountSompi ? formatSompiToKas(BigInt(receipt.amountSompi)) : "unknown"}`,
    `Fee:       ${receipt.feeSompi ? formatSompiToKas(BigInt(receipt.feeSompi)) : "unknown"}`,
    `Change:    ${receipt.changeSompi ? formatSompiToKas(BigInt(receipt.changeSompi)) : "none"}`,
    `Created:   ${receipt.createdAt || receipt.submittedAt || "unknown"}`,
    "",
    "State:"
  ];

  if (receipt.spentUtxoIds) {
    lines.push(`  Spent UTXOs:   ${receipt.spentUtxoIds.length}`);
  }
  if (receipt.createdUtxoIds) {
    lines.push(`  Created UTXOs: ${receipt.createdUtxoIds.length}`);
  }

  return {
    receipt,
    formatted: lines.join("\n")
  };
}
