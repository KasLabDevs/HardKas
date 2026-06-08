import { loadSimulatedTrace } from "@hardkas/localnet";
export async function runTrace(input) {
    const { txId, cwd } = input;
    const trace = await loadSimulatedTrace(txId, cwd ? { cwd } : undefined);
    const lines = [`Trace ${trace.txId}`, ""];
    for (const event of trace.events) {
        if (event.type === "phase.completed") {
            lines.push(`✓ ${event.phase}`);
        }
        else if (event.type === "tx.failed") {
            lines.push(`✗ ${event.phase}: ${event.reason}`);
        }
    }
    return {
        trace,
        formatted: lines.join("\n")
    };
}
//# sourceMappingURL=trace-runner.js.map