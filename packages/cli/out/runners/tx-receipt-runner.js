import { ProjectArtifactStore } from "@hardkas/artifacts";
import { formatSompiToKas } from "@hardkas/core";
export async function runTxReceipt(input) {
    const { txId, cwd } = input;
    const store = new ProjectArtifactStore(cwd || process.cwd());
    const receipt = await store.findReceiptByTxId(txId);
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
//# sourceMappingURL=tx-receipt-runner.js.map