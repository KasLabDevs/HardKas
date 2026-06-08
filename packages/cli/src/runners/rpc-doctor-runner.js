import { UI } from "../ui.js";
import { KaspaWrpcClient } from "@hardkas/kaspa-rpc";
import { loadHardkasConfig } from "@hardkas/config";
import net from "node:net";
async function checkTcpReachable(host, port, timeoutMs = 2000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeoutMs);
        socket.on("connect", () => {
            socket.destroy();
            resolve(true);
        });
        socket.on("timeout", () => {
            socket.destroy();
            resolve(false);
        });
        socket.on("error", () => {
            socket.destroy();
            resolve(false);
        });
        socket.connect(port, host);
    });
}
async function checkKaspaEndpoint(rpcUrl) {
    // Parse host:port from URL
    let host = "127.0.0.1";
    let port = 18210;
    try {
        const url = new URL(rpcUrl.replace("ws://", "http://").replace("wss://", "https://"));
        host = url.hostname || "127.0.0.1";
        port = parseInt(url.port) || 18210;
    }
    catch (e) { }
    // Layer 1: TCP
    const tcpOk = await checkTcpReachable(host, port);
    if (!tcpOk) {
        return {
            tcpReachable: false,
            protocolReachable: false,
            rpcReachable: false,
            status: "tcp_unreachable"
        };
    }
    // Layer 2: WebSocket protocol
    const client = new KaspaWrpcClient(rpcUrl);
    const start = Date.now();
    try {
        await client.connect(3000);
    }
    catch (err) {
        client.disconnect();
        return {
            tcpReachable: true,
            protocolReachable: false,
            rpcReachable: false,
            status: "protocol_error",
            error: err instanceof Error ? err.message : String(err)
        };
    }
    // Layer 3: RPC method call
    try {
        const info = (await client.getServerInfo());
        const dagInfo = (await client.getBlockDagInfo());
        const latencyMs = Date.now() - start;
        client.disconnect();
        return {
            tcpReachable: true,
            protocolReachable: true,
            rpcReachable: true,
            status: "ready",
            latencyMs,
            network: dagInfo?.networkId ||
                dagInfo?.network ||
                info?.networkId ||
                info?.network ||
                "unknown",
            daaScore: dagInfo?.virtualDaaScore || info?.virtualDaaScore || 0,
            version: info?.serverVersion || info?.server_version || "unknown"
        };
    }
    catch (err) {
        client.disconnect();
        return {
            tcpReachable: true,
            protocolReachable: true,
            rpcReachable: false,
            status: "rpc_error",
            error: err instanceof Error ? err.message : String(err)
        };
    }
}
async function checkHttpJsonRpcEndpoint(url) {
    const start = Date.now();
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 })
        });
        const latencyMs = Date.now() - start;
        if (res.ok) {
            const data = (await res.json());
            return {
                tcpReachable: true,
                protocolReachable: true,
                rpcReachable: true,
                status: "ready",
                latencyMs,
                network: typeof data.result === "string" ? data.result : "evm-chain",
                daaScore: 0,
                version: "L2 Endpoint"
            };
        }
        else {
            return {
                tcpReachable: true,
                protocolReachable: false,
                rpcReachable: false,
                status: "protocol_error",
                error: `HTTP error ${res.status}`
            };
        }
    }
    catch (err) {
        return {
            tcpReachable: false,
            protocolReachable: false,
            rpcReachable: false,
            status: "tcp_unreachable",
            error: err instanceof Error ? err.message : String(err)
        };
    }
}
export async function runRpcDoctor(options) {
    let endpoints = options.endpoints || [];
    let loadedNetworks = {};
    const loaded = await loadHardkasConfig(options.config ? { configPath: options.config } : {});
    loadedNetworks = (loaded.config.networks || {});
    if (endpoints.length === 0) {
        const defaultNetwork = loaded.config.defaultNetwork || "simnet";
        const network = loadedNetworks[defaultNetwork];
        const networkObj = typeof network === "object" && network !== null
            ? network
            : undefined;
        if (networkObj && typeof networkObj.rpcUrl === "string") {
            endpoints = [networkObj.rpcUrl];
        }
        else {
            endpoints = ["ws://127.0.0.1:18210"];
        }
    }
    UI.header("HardKAS RPC Doctor");
    console.log(`Auditing ${endpoints.length} endpoint(s)...\n`);
    const results = [];
    for (const url of endpoints) {
        // Resolve kind for the url
        let kind = "kaspa-rpc"; // default to Kaspa L1
        const foundNetwork = Object.values(loadedNetworks).find((n) => typeof n === "object" &&
            n !== null &&
            n.rpcUrl === url);
        if (foundNetwork && typeof foundNetwork.kind === "string") {
            kind = foundNetwork.kind;
        }
        else if (url.startsWith("http://") && !url.includes("18210")) {
            kind = "igra-rpc";
        }
        let result;
        if (kind === "kaspa-rpc" || kind === "kaspa-node") {
            result = await checkKaspaEndpoint(url);
        }
        else {
            result = await checkHttpJsonRpcEndpoint(url);
        }
        results.push({ url, health: result });
        console.log("┌── RPC HEALTH ────────────────────────────────────────────────");
        console.log(`│ ENDPOINT:   ${url.padEnd(48)} │`);
        console.log(`│ TCP:        ${(result.tcpReachable ? "✅ reachable" : "❌ unreachable").padEnd(48)} │`);
        if (result.tcpReachable) {
            console.log(`│ PROTOCOL:   ${(result.protocolReachable ? "✅ connected" : "❌ protocol_error (Port reachable, protocol adapter unsupported or protocol mismatch)").padEnd(48)} │`);
        }
        else {
            console.log(`│ PROTOCOL:   ${"❌ skipped".padEnd(48)} │`);
        }
        if (result.protocolReachable) {
            console.log(`│ RPC:        ${(result.rpcReachable ? "✅ ready" : "❌ rpc_error").padEnd(48)} │`);
            if (!result.rpcReachable && result.error) {
                console.log(`│ ERROR:      ${result.error.slice(0, 45).padEnd(48)} │`);
            }
            console.log(`│ NETWORK:    ${(result.network || "unknown").padEnd(48)} │`);
            console.log(`│ DAA SCORE:  ${(result.daaScore?.toString() || "0").padEnd(48)} │`);
            console.log(`│ VERSION:    ${(result.version || "unknown").padEnd(48)} │`);
            console.log(`│ LATENCY:    ${((result.latencyMs ?? 0) + "ms").padEnd(48)} │`);
        }
        else {
            console.log(`│ RPC:        ${"⏭️  skipped".padEnd(48)} │`);
            console.log(`│ STATUS:     ${result.status.padEnd(48)} │`);
            if (result.error) {
                console.log(`│ ERROR:      ${result.error.slice(0, 45).padEnd(48)} │`);
            }
        }
        console.log("└──────────────────────────────────────────────────────────────");
        console.log("");
    }
}
//# sourceMappingURL=rpc-doctor-runner.js.map