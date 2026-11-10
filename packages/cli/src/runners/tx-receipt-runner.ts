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

  // RC1: a network submission (hardkas.txSubmission.v1) carries the fee it derived (`fee.feeSompi`) and names its signed
  // artifact; the sender, recipient and amount are that signed artifact's. The text used to print "unknown" for all four.
  // Nothing is invented: an unresolvable signed artifact still shows "unknown". The JSON output is unchanged.
  let from: string | undefined = receipt.from?.address;
  let to: string | undefined = receipt.to?.address;
  let amountSompi: string | undefined = receipt.amountSompi;
  const feeSompi: string | undefined = receipt.feeSompi ?? receipt.fee?.feeSompi;
  // RC1 (oracle D1): the change of a network submission is its plan's (`change.amountSompi`, the plan being the signed
  // artifact's parent); it printed "none" for a payment that has change. Unresolvable: "unknown", never "none".
  const isSubmission = typeof receipt.signedArtifactId === "string";
  let changeSompi: string | undefined = receipt.changeSompi;
  if (isSubmission && (!from || !to || !amountSompi || changeSompi === undefined)) {
    try {
      const { resolveArtifactSync } = await import("@hardkas/artifacts");
      const signed: any = resolveArtifactSync(root, { artifact: receipt.signedArtifactId }).artifact;
      from ??= signed?.from?.address;
      to ??= signed?.to?.address;
      amountSompi ??= signed?.amountSompi;
      const planId = signed?.lineage?.parentArtifactId;
      if (changeSompi === undefined && typeof planId === "string") {
        const plan: any = resolveArtifactSync(root, { artifact: planId }).artifact;
        const change = plan?.change?.amountSompi;
        changeSompi = change === undefined || change === null ? "0" : String(change);
      }
    } catch {
      // the signed artifact or its plan is not in this workspace (or does not verify): those fields stay unknown
    }
  }
  const changeText =
    changeSompi !== undefined && changeSompi !== "0"
      ? formatSompiToKas(BigInt(changeSompi))
      : changeSompi === "0" || !isSubmission
        ? "none"
        : "unknown";

  const lines = [
    "Transaction receipt",
    "",
    `Tx ID:     ${receipt.txId}`,
    `Mode:      ${receipt.mode || "unknown"}`,
    `Network:   ${receipt.networkId || "unknown"}`,
    `From:      ${from || "unknown"}`,
    `To:        ${to || "unknown"}`,
    `Amount:    ${amountSompi ? formatSompiToKas(BigInt(amountSompi)) : "unknown"}`,
    `Fee:       ${feeSompi ? formatSompiToKas(BigInt(feeSompi)) : "unknown"}`,
    `Change:    ${changeText}`,
    `Created:   ${receipt.createdAt || receipt.submittedAt || "unknown"}`,
    "",
    "State:"
  ];

  // RC1 (oracle D1): a submission records the node's answer at the submit point, not the transaction's state now; the
  // section printed nothing for it. It says what was recorded and where the current state comes from.
  if (isSubmission) {
    const accepted = receipt.submitResult?.accepted;
    const daa = receipt.submitPoint?.virtualDaaScore;
    lines.push(`  Submitted:     ${accepted === true ? "accepted by the node" : accepted === false ? "refused by the node" : "outcome unknown"}${daa !== undefined ? ` at virtual DAA ${daa}` : ""}`);
    lines.push(`  Current state: hardkas tx status ${receipt.txId} (a receipt is not a confirmation)`);
  }
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
