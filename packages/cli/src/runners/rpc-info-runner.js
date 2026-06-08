import { KaspaJsonRpcClient } from "@hardkas/kaspa-rpc";
export async function runRpcInfo(options = {}) {
    const url = options.url || "http://127.0.0.1:18210";
    const protocol = url.startsWith("ws") ? "WebSocket" : "JSON-RPC";
    try {
        const client = new KaspaJsonRpcClient({ url });
        const info = await client.getServerInfo();
        const lines = [
            "Kaspa RPC info",
            "",
            `URL:      ${url}`,
            `Protocol: ${protocol}`,
            `Network:  ${info.networkId}`,
            `Synced:   ${info.isSynced ? "yes" : "no"}`,
            `Version:  ${info.serverVersion || "unknown"}`
        ];
        return {
            info,
            url,
            formatted: lines.join("\n")
        };
    }
    catch (e) {
        const lines = [
            "Kaspa RPC info",
            "",
            `URL:      ${url}`,
            `Protocol: ${protocol}`,
            `Status:   unreachable`,
            `Error:    ${e.message}`
        ];
        return {
            url,
            formatted: lines.join("\n")
        };
    }
}
//# sourceMappingURL=rpc-info-runner.js.map