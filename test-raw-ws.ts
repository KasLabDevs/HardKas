import { SimnetNodeHarness } from "./packages/testing/src/simnet-node-harness.js";
import WebSocket from "ws";

async function run() {
    console.log("=== RAW WS REPRODUCER ===");
    console.log("Starting fresh simnet node...");
    
    const node = await SimnetNodeHarness.start({ utxoIndex: true });
    await node.waitUntilReady();
    console.log(`Node at ${node.rpcUrl}`);

    const ws = new WebSocket(node.rpcUrl);
    await new Promise<void>((resolve, reject) => {
        ws.on("open", () => resolve());
        ws.on("error", (e) => reject(e));
    });
    console.log("WebSocket connected.");

    // Test 1: getServerInfoRequest (known to work)
    console.log("\n--- TEST 1: getServerInfoRequest ---");
    const info = await sendAndReceive(ws, {
        id: 1,
        method: "getServerInfoRequest",
        params: {}
    });
    console.log("Response:", JSON.stringify(info).substring(0, 200));

    // Test 2: getBlockTemplateRequest with extraData: []
    console.log("\n--- TEST 2: getBlockTemplateRequest (extraData: []) ---");
    const t2 = await sendAndReceive(ws, {
        id: 2,
        method: "getBlockTemplateRequest",
        params: {
            payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j",
            extraData: []
        }
    });
    console.log("Response:", JSON.stringify(t2).substring(0, 200));

    // Test 3: getBlockTemplateRequest with extraData: ""
    console.log("\n--- TEST 3: getBlockTemplateRequest (extraData: \"\") ---");
    const t3 = await sendAndReceive(ws, {
        id: 3,
        method: "getBlockTemplateRequest",
        params: {
            payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j",
            extraData: ""
        }
    });
    console.log("Response:", JSON.stringify(t3).substring(0, 200));

    // Test 4: getBlockTemplateRequest without extraData
    console.log("\n--- TEST 4: getBlockTemplateRequest (no extraData) ---");
    const t4 = await sendAndReceive(ws, {
        id: 4,
        method: "getBlockTemplateRequest",
        params: {
            payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j"
        }
    });
    console.log("Response:", JSON.stringify(t4).substring(0, 200));

    // Test 5: Does JsonWrpcKaspaClient wrap it differently?
    console.log("\n--- TEST 5: getBlockTemplateRequest with jsonrpc 2.0 envelope ---");
    const t5 = await sendAndReceive(ws, {
        jsonrpc: "2.0",
        id: 5,
        method: "getBlockTemplateRequest",
        params: {
            payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j",
            extraData: ""
        }
    });
    console.log("Response:", JSON.stringify(t5).substring(0, 200));

    ws.close();
    await node.kill();
    console.log("\nDone.");
}

function sendAndReceive(ws: WebSocket, payload: object): Promise<any> {
    return new Promise((resolve, reject) => {
        const json = JSON.stringify(payload);
        console.log("  OUTBOUND:", json);
        
        const timeout = setTimeout(() => reject(new Error("Timeout")), 5000);
        
        ws.once("message", (data) => {
            clearTimeout(timeout);
            try {
                resolve(JSON.parse(data.toString()));
            } catch {
                resolve(data.toString());
            }
        });
        
        ws.send(json);
    });
}

run().catch(console.error);
