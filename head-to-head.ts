// head-to-head.ts — Compare working JsonWrpcKaspaClient vs raw WebSocket
// Same node, same port, same session.

import { SimnetNodeHarness } from "./packages/testing/src/simnet-node-harness.js";
import { JsonWrpcKaspaClient } from "./packages/kaspa-rpc/src/index.js";
import WebSocket from "ws";

const node = await SimnetNodeHarness.start({ utxoIndex: true });
await node.waitUntilReady();
console.log("Node rpcUrl:", node.rpcUrl);
console.log("Node simulated:", (node as any).simulated);

// ── Part A: JsonWrpcKaspaClient (known to work for getServerInfo) ──
console.log("\n=== PART A: JsonWrpcKaspaClient ===");
const client = new JsonWrpcKaspaClient({ rpcUrl: node.rpcUrl });

// Monkey-patch the socket send to capture outbound
const origConnect = (client as any).connect.bind(client);
(client as any).connect = async function() {
    const ws = await origConnect();
    const origSend = ws.send.bind(ws);
    ws.send = function(data: any, ...args: any[]) {
        console.log(`  [CLIENT TX] ${typeof data === "string" ? data.substring(0, 300) : `<binary ${data.length}b>`}`);
        return origSend(data, ...args);
    };
    // Also log all incoming messages
    ws.on("message", (msg: any) => {
        const txt = msg.toString();
        console.log(`  [CLIENT RX] ${txt.substring(0, 300)}`);
    });
    return ws;
};

try {
    console.log("\nA1. getServerInfo via JsonWrpcKaspaClient...");
    const si = await client.getServerInfo();
    console.log("    RESULT: OK —", JSON.stringify(si).substring(0, 100));
} catch(e: any) {
    console.log("    RESULT: FAIL —", e.message);
}

try {
    console.log("\nA2. getBlockTemplateRequest via JsonWrpcKaspaClient...");
    const tpl = await client.call("getBlockTemplateRequest", {
        payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j",
        extraData: ""
    });
    console.log("    RESULT: OK — keys:", Object.keys(tpl as any));
} catch(e: any) {
    console.log("    RESULT: FAIL —", e.message);
}

await client.close();

// ── Part B: Raw WebSocket to same URL ──
console.log("\n=== PART B: Raw WebSocket ===");

const ws = new WebSocket(node.rpcUrl);
await new Promise<void>((resolve, reject) => {
    ws.on("open", () => { console.log("B: WebSocket connected"); resolve(); });
    ws.on("error", (e) => reject(e));
});

// Listen to ALL messages
ws.on("message", (data, isBinary) => {
    if (isBinary) {
        const buf = Buffer.from(data as any);
        console.log(`  [RAW RX] BINARY (${buf.length}b): ${buf.toString("hex").substring(0, 60)}`);
    } else {
        console.log(`  [RAW RX] TEXT: ${data.toString().substring(0, 300)}`);
    }
});

// Send same format as JsonWrpcKaspaClient
const payload = JSON.stringify({ jsonrpc: "2.0", id: 99, method: "getServerInfoRequest", params: {} });
console.log(`\nB1. Sending: ${payload}`);
ws.send(payload);

// Wait 3 seconds for response
await new Promise(r => setTimeout(r, 3000));

// Try sending as binary buffer
const binPayload = Buffer.from(payload);
console.log(`\nB2. Sending as binary (${binPayload.length}b)`);
ws.send(binPayload);

await new Promise(r => setTimeout(r, 3000));

ws.close();
await node.kill();
console.log("\nDONE");
process.exit(0);
