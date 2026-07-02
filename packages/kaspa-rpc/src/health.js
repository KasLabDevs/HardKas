import { KaspaJsonRpcClient } from "./json-rpc-client.js";
import { KaspaWrpcClient } from "./wrpc-client.js";
export async function checkKaspaRpcHealth(options) {
    const url = options?.url || "ws://127.0.0.1:18210";
    const checkedAt = new Date().toISOString();
    const timeoutMs = options?.timeoutMs || 2000;
    // wRPC (WebSocket) branch
    if (url.startsWith("ws://") ||
        url.startsWith("wss://") ||
        url.includes("18210") ||
        url.includes("18110")) {
        const client = new KaspaWrpcClient(url);
        const start = Date.now();
        try {
            await client.connect(timeoutMs);
            const info = (await client.getServerInfo());
            const dagInfo = (await client.getBlockDagInfo());
            const latencyMs = Date.now() - start;
            client.disconnect();
            return {
                endpoint: url,
                protocol: url.startsWith("ws") ? "WebSocket" : "JSON-RPC",
                status: "healthy",
                ready: true,
                checkedAt,
                latencyMs,
                networkId: dagInfo?.networkId || "simnet",
                virtualDaaScore: dagInfo?.virtualDaaScore?.toString() || "0",
                serverVersion: info?.serverVersion || "unknown",
                isSynced: info?.isSynced ?? true,
                lastError: null,
                stale: !(info?.isSynced ?? true)
            };
        }
        catch (e) {
            client.disconnect();
            return {
                endpoint: url,
                protocol: url.startsWith("ws") ? "WebSocket" : "JSON-RPC",
                status: "unreachable",
                ready: false,
                checkedAt,
                error: e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e),
                lastError: e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)
            };
        }
    }
    // HTTP fallback branch (e.g. L2)
    const client = new KaspaJsonRpcClient({ url, timeoutMs });
    try {
        const health = await client.healthCheck();
        return {
            endpoint: url,
            protocol: "JSON-RPC",
            status: health.status,
            ready: health.status === "healthy" || health.status === "degraded",
            checkedAt,
            ...(health.latencyMs !== undefined ? { latencyMs: health.latencyMs } : {}),
            ...(health.info?.networkId !== undefined
                ? { networkId: health.info.networkId }
                : {}),
            ...(health.info?.virtualDaaScore !== undefined
                ? { virtualDaaScore: health.info.virtualDaaScore.toString() }
                : {}),
            ...(health.info?.serverVersion !== undefined
                ? { serverVersion: health.info.serverVersion }
                : {}),
            ...(health.info?.isSynced !== undefined ? { isSynced: health.info.isSynced } : {}),
            lastError: health.lastError,
            ...(health.retries !== undefined ? { retries: health.retries } : {}),
            ...(health.circuitState !== undefined ? { circuitState: health.circuitState } : {}),
            stale: health.stale
        };
    }
    catch (e) {
        return {
            endpoint: url,
            protocol: "JSON-RPC",
            status: "unreachable",
            ready: false,
            checkedAt,
            error: e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e),
            lastError: e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)
        };
    }
}
export async function waitForKaspaRpcReady(options) {
    let currentIntervalMs = options?.intervalMs || 250;
    const maxIntervalMs = 2000;
    const maxWaitMs = options?.maxWaitMs || 60000;
    const start = Date.now();
    let lastResult;
    while (Date.now() - start < maxWaitMs) {
        lastResult = await checkKaspaRpcHealth({
            url: options?.url,
            timeoutMs: options?.timeoutMs
        });
        if (lastResult.ready) {
            return lastResult;
        }
        await new Promise((resolve) => setTimeout(resolve, currentIntervalMs));
        currentIntervalMs = Math.min(currentIntervalMs * 2, maxIntervalMs);
    }
    return (lastResult || {
        endpoint: options?.url || "ws://127.0.0.1:18210",
        protocol: (options?.url || "ws://127.0.0.1:18210").startsWith("ws")
            ? "WebSocket"
            : "JSON-RPC",
        status: "unreachable",
        ready: false,
        checkedAt: new Date().toISOString(),
        error: "Timed out waiting for RPC to be ready"
    });
}
