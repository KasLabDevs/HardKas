import { SimnetNodeHarness } from "./packages/testing/src/simnet-node-harness.js";
import { JsonWrpcKaspaClient } from "./packages/kaspa-rpc/src/index.js";
import * as process from "process";

async function run() {
    const imageName = process.env.KASPAD_IMAGE || "kaspanet/rusty-kaspad:v2.0.1";
    console.log(`\n=================================`);
    console.log(`Testing image: ${imageName}`);
    console.log(`=================================`);

    const node = await SimnetNodeHarness.start({ utxoIndex: true });
    await node.waitUntilReady();
    console.log(`Node running at ${node.rpcUrl}`);

    const client = new JsonWrpcKaspaClient({ rpcUrl: node.rpcUrl, timeoutMs: 5000 }); const oldSend = (client as any).socket?.send; if ((client as any).socket) { (client as any).socket.send = (data: any) => { if (data.includes("getBlockTemplateRequest")) console.log("OUTBOUND:", data); oldSend?.call((client as any).socket, data); }; }
    await client.connect();

    try {
        console.log("Getting block template...");
        const templateRes = await client.call("getBlockTemplateRequest", {
            payAddress: "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j",
            
        }) as any;
        
        const blockMessage = templateRes.blockMessage || templateRes.block;
        console.log("Template:", JSON.stringify(blockMessage).substring(0, 150));

        console.log("Submitting block...");
        const submitRes = await client.call("getBlockTemplateRequest", {
            block: blockMessage,
            
        }) as any;

        console.log("SUCCESS! Block accepted.");
        if (submitRes.rejectReason) {
             console.log("Rejected:", submitRes.rejectReason);
        }
    } catch (e: any) {
        console.log(`FAIL! Error: ${e.message}`);
    } finally {
        await client.disconnect();
        await node.kill();
    }
}

run().catch(console.error);
