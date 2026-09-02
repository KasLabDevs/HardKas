import { checkKaspaRpcHealth, waitForKaspaRpcReady } from "@hardkas/kaspa-rpc";
import { classifyRpcError, humanReadableRpcError } from "../cli-errors.js";
export async function runRpcHealth(options) {
    const start = Date.now();
    let result;
    if (options.wait) {
        console.log(`Waiting for Kaspa RPC at ${options.url || "http://127.0.0.1:18210"} ...`);
        result = await waitForKaspaRpcReady({
            url: options.url,
            maxWaitMs: (options.timeout || 60) * 1000,
            intervalMs: options.interval || 1000
        });
    }
    else {
        result = await checkKaspaRpcHealth({ url: options.url });
    }
    const durationMs = Date.now() - start;
    let formatted = "";
    if (result.ready) {
        if (options.wait) {
            formatted += `Ready after ${Math.round(durationMs / 100) / 10}s\n\n`;
        }
        formatted += [
            "RPC Health",
            `  Endpoint: ${result.endpoint}`,
            `  Protocol: ${result.protocol}`,
            `  Network:  ${result.networkId}`,
            `  Status:   reachable`,
            `  Latency:  ${result.latencyMs}ms`,
            `  DAA:      ${result.virtualDaaScore}`,
            `  Version:  ${result.serverVersion || "unknown"}`,
            `  Synced:   ${result.isSynced ? "yes" : "no"}`
        ].join("\n");
    }
    else {
        if (options.wait) {
            formatted += `RPC not ready after ${options.timeout || 60}s\n\n`;
        }
        // Classify the error into a typed RPC error code
        const errorCode = classifyRpcError(result.error || "Unknown error");
        const cleanError = humanReadableRpcError(errorCode);
        formatted += [
            "RPC Health",
            `  Endpoint: ${result.endpoint}`,
            `  Protocol: ${result.protocol}`,
            `  Network:  ${result.networkId || "unknown"}`,
            `  Status:   unreachable`,
            `  Code:     ${errorCode}`,
            `  Error:    ${cleanError}`,
            "",
            "Suggestion:",
            "  Check if the node is running: hardkas node status",
            "  View node logs: hardkas node logs --tail 50"
        ].join("\n");
    }
    return {
        result,
        formatted,
        durationMs
    };
}
//# sourceMappingURL=rpc-health-runner.js.map