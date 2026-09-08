import { SimnetNodeHarness } from "./packages/testing/src/simnet-node-harness.js";
import WebSocket from "ws";

async function run() {
    const node = await SimnetNodeHarness.start({ utxoIndex: true });
    await node.waitUntilReady();
    console.log(`Node running at ${node.rpcUrl}`);

    const ws = new WebSocket(node.rpcUrl);
    
    await new Promise((resolve) => ws.on("open", resolve));
    
    console.log("Sending getBlockTemplateRequest...");
    const reqId = Date.now();
    const payload = JSON.stringify({
        jsonrpc: "2.0",
        id: reqId,
        method: "getBlockTemplateRequest",
        params: {
            payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j",
            extraData: "00"
        }
    });
    console.log("OUTBOUND JSON:");
    console.log(payload);

    ws.send(payload);

    ws.on("message", (data) => {
        console.log("INBOUND RESPONSE:");
        console.log(data.toString());
        ws.close();
        node.kill();
    });
}

run().catch(console.error);
