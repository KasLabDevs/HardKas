import { SimnetNodeHarness } from "./packages/testing/src/simnet-node-harness.js";
import WebSocket from "ws";

async function run() {
    console.log("=== DEFINITIVE ENVELOPE REPRODUCER ===\n");
    
    const node = await SimnetNodeHarness.start({ utxoIndex: true });
    await node.waitUntilReady();
    console.log(`Node at ${node.rpcUrl}\n`);

    const ws = new WebSocket(node.rpcUrl);
    await new Promise<void>((resolve, reject) => {
        ws.on("open", () => resolve());
        ws.on("error", (e) => reject(e));
    });

    // Kaspa wRPC JSON format is NOT JSON-RPC 2.0.
    // Based on rusty-kaspa source, the format might be:
    // { "method": "...", "params": {...} }  -- no id, no jsonrpc
    // OR it could use the id for correlation
    
    const tests: Array<{name: string, payload: object}> = [
        {
            name: "A: No id, no jsonrpc",
            payload: { method: "getServerInfoRequest", params: {} }
        },
        {
            name: "B: With id, no jsonrpc",
            payload: { id: 1, method: "getServerInfoRequest", params: {} }
        },
        {
            name: "C: With jsonrpc 2.0 + id",
            payload: { jsonrpc: "2.0", id: 2, method: "getServerInfoRequest", params: {} }
        },
        {
            name: "D: getBlockTemplate - no id, no jsonrpc",
            payload: { 
                method: "getBlockTemplateRequest",
                params: { payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j" }
            }
        },
        {
            name: "E: getBlockTemplate - with id, no jsonrpc",
            payload: { 
                id: 3,
                method: "getBlockTemplateRequest",
                params: { payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j" }
            }
        },
        {
            name: "F: getBlockTemplate - with jsonrpc + id",
            payload: { 
                jsonrpc: "2.0",
                id: 4,
                method: "getBlockTemplateRequest",
                params: { payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j" }
            }
        },
    ];

    for (const test of tests) {
        console.log(`--- ${test.name} ---`);
        try {
            const resp = await sendAndReceive(ws, test.payload, 3000);
            const isError = resp.error;
            console.log(`  Result: ${isError ? 'ERROR: ' + JSON.stringify(resp.error) : 'OK'}`);
            if (!isError) console.log(`  Response keys: ${Object.keys(resp).join(', ')}`);
        } catch (e: any) {
            console.log(`  Result: ${e.message}`);
        }
        console.log();
    }

    ws.close();
    await node.kill();
    console.log("=== DONE ===");
}

function sendAndReceive(ws: WebSocket, payload: object, timeoutMs: number): Promise<any> {
    return new Promise((resolve, reject) => {
        const json = JSON.stringify(payload);
        console.log(`  TX: ${json}`);
        const timeout = setTimeout(() => reject(new Error(`Timeout (${timeoutMs}ms) - no response from node`)), timeoutMs);
        ws.once("message", (data) => {
            clearTimeout(timeout);
            const txt = data.toString();
            console.log(`  RX: ${txt.substring(0, 300)}`);
            try { resolve(JSON.parse(txt)); } catch { resolve(txt); }
        });
        ws.send(json);
    });
}

run().catch(console.error);
