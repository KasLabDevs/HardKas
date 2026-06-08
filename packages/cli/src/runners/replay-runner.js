import { getSimulatedReplaySummary } from "@hardkas/localnet";
import { formatSompi } from "@hardkas/core";
export async function runReplay(input) {
    const { txId, cwd } = input;
    const replay = await getSimulatedReplaySummary(txId, cwd ? { cwd } : undefined);
    const { receipt, trace, summary } = replay;
    const lines = [
        "Replay summary",
        "",
        `Tx ID: ${receipt.txId}`,
        "",
        "This transaction:",
        `- spent ${summary.spentCount} UTXO(s)`,
        `- created ${summary.createdCount} UTXO(s)`,
        `- transferred ${formatSompi(summary.transferredSompi)}`,
        `- paid ${formatSompi(summary.feeSompi)} fee`,
        `- returned ${formatSompi(summary.changeSompi)} as change`,
        `- advanced local DAA score to ${summary.finalDaaScore}`,
        "",
        "Trace:"
    ];
    for (const event of trace.events) {
        if (event.type === "phase.completed") {
            lines.push(`✓ ${event.phase}`);
        }
        else if (event.type === "tx.failed") {
            lines.push(`✗ ${event.phase}: ${event.reason}`);
        }
    }
    return {
        replay,
        formatted: lines.join("\n")
    };
}
//# sourceMappingURL=replay-runner.js.map