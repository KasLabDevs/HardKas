// field-isolate.ts — Find exactly which field/value causes deserialization error
import { SimnetNodeHarness } from "./packages/testing/src/simnet-node-harness.js";
import { JsonWrpcKaspaClient } from "./packages/kaspa-rpc/src/index.js";

const node = await SimnetNodeHarness.start({ utxoIndex: true });
await node.waitUntilReady();
console.log("Node:", node.rpcUrl, "simulated:", (node as any).simulated);

const client = new JsonWrpcKaspaClient({ rpcUrl: node.rpcUrl });

const variants: Array<{name: string, params: Record<string, any>}> = [
    { name: "payAddress only", params: { payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j" } },
    { name: "extraData: ''", params: { payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j", extraData: "" } },
    { name: "extraData: []", params: { payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j", extraData: [] } },
    { name: "extraData: '00'", params: { payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j", extraData: "00" } },
    { name: "extraData: null", params: { payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j", extraData: null } },
    { name: "pay_address (snake_case)", params: { pay_address: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j" } },
    { name: "pay_address + extra_data", params: { pay_address: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j", extra_data: "" } },
    { name: "empty params", params: {} },
    { name: "getServerInfo (control)", params: {} },
];

for (const v of variants) {
    const method = v.name === "getServerInfo (control)" ? "getServerInfo" : "getBlockTemplate";
    try {
        const res = await client.call(method, v.params);
        console.log(`✅ ${v.name}: OK`);
    } catch(e: any) {
        console.log(`❌ ${v.name}: ${e.message}`);
    }
}

await client.close();
await node.kill();
process.exit(0);
