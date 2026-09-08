import { SimnetNodeHarness } from "./packages/testing/src/simnet-node-harness.js";
import { KaspaWrpcClient } from "./packages/kaspa-rpc/src/wrpc-client.js";

const node = await SimnetNodeHarness.start({ utxoIndex: true });
await node.waitUntilReady();
console.log("rpcUrl:", node.rpcUrl);

const wrpc = new KaspaWrpcClient(node.rpcUrl);
await wrpc.connect();

try {
    console.log("\n1. KaspaWrpcClient getServerInfoRequest...");
    const si = await wrpc.request("getServerInfoRequest", {});
    console.log("   OK:", JSON.stringify(si).substring(0, 100));
} catch(e: any) {
    console.log("   FAIL:", e.message);
}

try {
    console.log("\n2. KaspaWrpcClient getBlockTemplateRequest (no extraData)...");
    const res = await wrpc.request("getBlockTemplateRequest", {
        payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j"
    });
    console.log("   OK:", JSON.stringify(res).substring(0, 200));
} catch(e: any) {
    console.log("   FAIL:", e.message);
}

try {
    console.log("\n3. KaspaWrpcClient getBlockTemplateRequest (extraData: '')...");
    const res = await wrpc.request("getBlockTemplateRequest", {
        payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j",
        extraData: ""
    });
    console.log("   OK:", JSON.stringify(res).substring(0, 200));
} catch(e: any) {
    console.log("   FAIL:", e.message);
}

try {
    console.log("\n4. KaspaWrpcClient submitBlockRequest (after template)...");
    const tpl: any = await wrpc.request("getBlockTemplateRequest", {
        payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j",
        extraData: ""
    });
    const block = tpl.blockMessage || tpl.block;
    console.log("   Template block keys:", Object.keys(block || {}));
    
    const submit = await wrpc.request("submitBlockRequest", {
        block,
        allowNonDAABlocks: false
    });
    console.log("   SUBMIT OK:", JSON.stringify(submit).substring(0, 200));
} catch(e: any) {
    console.log("   FAIL:", e.message);
}

wrpc.disconnect();
await node.kill();
process.exit(0);
