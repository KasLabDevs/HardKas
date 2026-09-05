import { SimnetNodeHarness } from "./packages/testing/src/simnet-node-harness.js";

const node = await SimnetNodeHarness.start({ utxoIndex: true });
await node.waitUntilReady();
console.log("simulated:", (node as any).simulated);
console.log("rpcUrl:", node.rpcUrl);
console.log("processId:", node.processId);

try {
    const res = await node.mining.mineBlock();
    console.log("mineBlock result:", JSON.stringify(res));
} catch (e: any) {
    console.log("mineBlock error:", e.message);
}

await node.kill();
process.exit(0);
