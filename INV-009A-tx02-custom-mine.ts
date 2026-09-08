import { Hardkas } from "./packages/sdk/src/index.js";
import { SimnetNodeHarness } from "./packages/testing/src/simnet-node-harness.js";
import { getOrCreateDevAccount } from "./packages/accounts/src/dev-accounts.js";

async function run() {
    console.log("=================================");
    console.log("INV-009A: TX-02 (Relay Fee Floor)");
    console.log("=================================");

    console.log("Starting fresh Simnet Node...");
    const node = await SimnetNodeHarness.start({ utxoIndex: true });
    await node.waitUntilReady();
    console.log("Node running at", node.rpcUrl);

    try {
        const hk = await Hardkas.create({
            network: "simnet",
            mode: "agent",
            autoBootstrap: true,
            rpc: { endpoints: [node.rpcUrl.replace("ws://", "")] }
        });

        // Try to mine a block using modified json
        const alice = await getOrCreateDevAccount(process.cwd(), 400, "inv_009a_alice");
        
        console.log("Mining blocks to fund Alice manually...");
        const templateRes = await hk.rpc.call("getBlockTemplateRequest", {
            payAddress: alice.address.replace("simnet:", "kaspasim:"),
            extraData: []
        });
        
        const blockMessage = (templateRes as any).blockMessage || (templateRes as any).block;
        console.log("Template:", JSON.stringify(blockMessage).substring(0, 200));

        // Attempt formatting
        blockMessage.header.nonce = blockMessage.header.nonce.toString();
        blockMessage.header.timestamp = blockMessage.header.timestamp.toString();
        blockMessage.header.daaScore = blockMessage.header.daaScore.toString();
        blockMessage.header.blueScore = blockMessage.header.blueScore.toString();
        
        try {
            await hk.rpc.call("submitBlockRequest", { block: blockMessage });
            console.log("SUCCESS MINING BLOCK!!!");
        } catch(e: any) {
            console.log("Failed again:", e.message);
        }
        
    } catch (e: any) {
        console.log("Error:", e.message);
    } finally {
        await node.kill();
    }
}

run().catch(console.error);
