import { DockerKaspadRunner } from "@hardkas/node-runner";
import { KaspaWrpcClient } from "@hardkas/kaspa-rpc";

async function test() {
    const runner = new DockerKaspadRunner({ network: "simnet" });
    await runner.start();
    await new Promise(r => setTimeout(r, 5000));
    const c = new KaspaWrpcClient("ws://127.0.0.1:18210");
    await c.connect(5000);
    
    // Fetch block and get coinbase tx
    console.log("Fetching dag info...");
    const info = await c.request("getBlockDagInfo", {}) as any;
    const tip = info.tipHashes[0];
    const res = await c.request("getBlock", { hash: tip, includeTransactions: true }) as any;
    const tx = res.block.transactions[0];
    delete tx.verboseData;
    for (const out of tx.outputs) delete out.verboseData;

    console.log("Submitting original fetched tx...");
    try {
        await c.request("submitTransaction", { transaction: tx, allowOrphan: false });
        console.log("Original submitted!");
    } catch(e: any) {
        console.log("Original submit error:", e.message); // Should be "transaction tries to spend..." NOT deserialization error
    }

    // Now mutate it step by step
    console.log("\nTesting mutation 1: amount instead of value");
    let tx1 = JSON.parse(JSON.stringify(tx));
    tx1.outputs[0].amount = tx1.outputs[0].value;
    delete tx1.outputs[0].value;
    try {
        await c.request("submitTransaction", { transaction: tx1, allowOrphan: false });
    } catch(e: any) { console.log("Mut1 error:", e.message); }

    console.log("\nTesting mutation 2: value as string");
    let tx2 = JSON.parse(JSON.stringify(tx));
    tx2.outputs[0].value = "10000";
    try {
        await c.request("submitTransaction", { transaction: tx2, allowOrphan: false });
    } catch(e: any) { console.log("Mut2 error:", e.message); }

    const payloadStr = `{"gas":0,"inputs":[{"previousOutpoint":{"index":0,"transactionId":"7df19d60d9de7b66f161bede36a650047f664996a65582b76c2315bec23ac678"},"sequence":"0","sigOpCount":1,"signatureScript":"41655ceaa1ec5bb53457ec77cd2f54a8677c77cf4794e5033c411d310e53a3eb271e89ceea5c00e1cf92aef4afb55f6fb083c65e8a00ddfc531cd3305de1d3cb01"}],"lockTime":0,"mass":0,"outputs":[{"scriptPublicKey":"000020b28fa60b2866c3780c758aab5eea1b304f0064232cbabec764f33058a8614f96ac","value":10000000000}],"payload":"","subnetworkId":"0000000000000000000000000000000000000000","version":0}`;
    
    const baseTx = JSON.parse(payloadStr);

    const testTx = async (name: string, tx: any) => {
        try {
            await c.request("submitTransaction", { transaction: tx, allowOrphan: false });
            console.log(name, "-> SUCCESS!");
        } catch(e: any) {
            console.log(name, "->", e.message);
        }
    };

    await testTx("Base TX", baseTx);

    const m1 = JSON.parse(JSON.stringify(baseTx)); m1.inputs[0].sequence = 0;
    await testTx("Sequence = Number", m1);

    const m2 = JSON.parse(JSON.stringify(baseTx)); m2.inputs[0].sigOpCount = "1";
    await testTx("sigOpCount = String", m2);

    const m3 = JSON.parse(JSON.stringify(baseTx)); delete m3.inputs[0].sigOpCount;
    await testTx("sigOpCount = Deleted", m3);

    const m4 = JSON.parse(JSON.stringify(baseTx)); m4.inputs[0].previousOutpoint.index = "0";
    await testTx("index = String", m4);

    const m5 = JSON.parse(JSON.stringify(baseTx)); m5.outputs[0].value = "10000000000";
    await testTx("value = String", m5);

    const m6 = JSON.parse(JSON.stringify(baseTx)); m6.inputs[0].sequence = Number.MAX_SAFE_INTEGER;
    await testTx("Sequence = Max safe int", m6);

    const m7 = JSON.parse(JSON.stringify(baseTx)); m7.mass = "0"; m7.gas = "0"; m7.lockTime = "0"; m7.version = "0";
    await testTx("mass, gas, lockTime, version = String", m7);
    
    c.disconnect();
    await runner.stop();
}
test().catch(console.error);
