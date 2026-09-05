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

        const alice = await getOrCreateDevAccount(process.cwd(), 400, "inv_009a_alice");
        const bob = await getOrCreateDevAccount(process.cwd(), 401, "inv_009a_bob");

        console.log("Mining blocks to fund Alice...");
        await node.mining.mineBlock({ payAddress: alice.address });
        console.log("Maturity blocks...");
        await node.mining.mineBlocks(100);

        console.log("Planning TX with feeRate: 0n...");
        const plan = await hk.tx.plan({ from: alice, to: bob, amount: 10000n, feeRate: 0n });
        console.log(`Plan successful. Inputs: ${plan.inputs.length}, Fee: ${plan.fee}, Mass: ${plan.mass}`);
        
        const signed = await hk.tx.sign(plan, { account: alice });
        
        console.log("Submitting TX to node...");
        const res = await hk.tx.send(signed);
        console.log("FAIL: Node ACCEPTED the transaction with 0 fee! Receipt:", res.receipt.id);
        
    } catch (e: any) {
        if (e.message?.includes("fee is below the relay fee")) {
            console.log("SUCCESS: TX-02 rejected as expected:", e.message);
        } else {
            console.log("Node REJECTED the transaction (unexpected reason):", e.message);
        }
    } finally {
        await node.kill();
    }
}

run().catch(console.error);
