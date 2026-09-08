import { SimnetNodeHarness } from "./packages/testing/src/simnet-node-harness.js";
import { JsonWrpcKaspaClient } from "./packages/kaspa-rpc/src/index.js";

const node = await SimnetNodeHarness.start({ utxoIndex: true });
await node.waitUntilReady();
console.log("simulated:", (node as any).simulated);
console.log("rpcUrl:", node.rpcUrl);

const client = new JsonWrpcKaspaClient({ rpcUrl: node.rpcUrl });

try {
    console.log("\n1. getInfo...");
    const info = await client.getInfo();
    console.log("   OK:", JSON.stringify(info).substring(0, 100));
} catch(e: any) {
    console.log("   FAIL:", e.message);
}

try {
    console.log("\n2. getServerInfo...");
    const si = await client.getServerInfo();
    console.log("   OK:", JSON.stringify(si).substring(0, 100));
} catch(e: any) {
    console.log("   FAIL:", e.message);
}

try {
    console.log("\n3. getBlockTemplateRequest...");
    const res = await client.call("getBlockTemplateRequest", {
        payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j",
        extraData: []
    });
    console.log("   OK:", JSON.stringify(res).substring(0, 200));
} catch(e: any) {
    console.log("   FAIL:", e.message);
}

try {
    console.log("\n4. getBlockTemplateRequest (extraData: '')...");
    const res = await client.call("getBlockTemplateRequest", {
        payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j",
        extraData: ""
    });
    console.log("   OK:", JSON.stringify(res).substring(0, 200));
} catch(e: any) {
    console.log("   FAIL:", e.message);
}

try {
    console.log("\n5. getBlockTemplateRequest (no extraData)...");
    const res = await client.call("getBlockTemplateRequest", {
        payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j"
    });
    console.log("   OK:", JSON.stringify(res).substring(0, 200));
} catch(e: any) {
    console.log("   FAIL:", e.message);
}

await client.close();
await node.kill();
process.exit(0);
