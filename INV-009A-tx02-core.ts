import { Hardkas } from "./packages/sdk/src/index.js";
import { getOrCreateDevAccount } from "./packages/accounts/src/dev-accounts.js";
import { RpcClient } from "@kaspa/core-lib";

async function mineBlockWithCore(coreRpc: RpcClient, address: string) {
    const template = await coreRpc.getBlockTemplate({ payAddress: address, extraData: "" });
    await coreRpc.submitBlock({ block: template.block, allowNonDAABlocks: false });
}

async function run() {
    console.log("=================================");
    console.log("INV-009A: TX-02 (Relay Fee Floor)");
    console.log("=================================");

    // We will just use the already running node on 18210
    const rpcUrl = "127.0.0.1:18210"; const coreRpcUrl = "127.0.0.1:16210";

    const coreRpc = new RpcClient({
        url: `ws://${rpcUrl}`,
        networkId: "simnet",
        resolver: undefined
    });
    await coreRpc.connect();

    try {
        const hk = await Hardkas.create({
            network: "simnet",
            mode: "agent",
            autoBootstrap: true,
            rpc: { endpoints: [rpcUrl] }
        });

        const alice = await getOrCreateDevAccount(process.cwd(), 500, "inv_009a_alice_v5");
        const bob = await getOrCreateDevAccount(process.cwd(), 501, "inv_009a_bob_v5");

        console.log("Mining blocks to fund Alice...");
        await mineBlockWithCore(coreRpc, alice.address.replace("simnet:", "kaspasim:"));
        console.log("Maturity blocks...");
        for(let i=0; i<100; i++) {
            await mineBlockWithCore(coreRpc, "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j");
        }

        console.log("Planning TX with feeRate: 0n...");
        const plan = await hk.tx.plan({ from: alice, to: bob, amount: 10000n, feeRate: 0n });
        console.log(`Plan successful. Inputs: ${plan.inputs.length}, Fee: ${plan.fee}, Mass: ${plan.mass}`);
        
        const signed = await hk.tx.sign(plan, { account: alice });
        
        console.log("Submitting TX to node...");
        const res = await hk.tx.send(signed);
        console.log("FAIL: Node ACCEPTED the transaction with 0 fee! Receipt:", res.receipt.id);
        
    } catch (e: any) {
        if (e.message?.includes("fee is below the relay fee") || e.message?.includes("reject") || e.message?.includes("Relay")) {
            console.log("SUCCESS: TX-02 rejected as expected:", e.message);
        } else {
            console.log("Node REJECTED the transaction (unexpected reason):", e.message);
        }
    } finally {
        await coreRpc.disconnect();
    }
}

run().catch(console.error);
