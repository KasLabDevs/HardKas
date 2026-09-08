import { SimnetNodeHarness } from "./packages/testing/src/simnet-node-harness.js";
import { JsonWrpcKaspaClient } from "./packages/kaspa-rpc/src/index.js";

const node = await SimnetNodeHarness.start({ utxoIndex: true });
await node.waitUntilReady();
console.log("Node:", node.rpcUrl);
const client = new JsonWrpcKaspaClient({ rpcUrl: node.rpcUrl });

// We need valid checksum addresses. Let's use known ones, or ones that are structurally valid.
// Actually, if we just send something completely wrong, it gives deserialization error.
// What if we use a known good address from somewhere?
// The easiest is just to try different prefixes on the same payload, but checksum will be wrong if we just swap prefix.

// Let's import PrivateKey from core-lib if possible, or just mock it.
// I will try an address that the WASM SDK generates for simnet.
import { PrivateKey, Network } from "./packages/core-lib/src/index.js";

const priv = new PrivateKey();
const variants = [
    { name: "simnet core-lib", prefix: "simnet" },
    { name: "testnet core-lib", prefix: "kaspatest" },
    { name: "mainnet core-lib", prefix: "kaspa" },
    { name: "kaspasim core-lib", prefix: "kaspasim" }
];

for (const v of variants) {
    try {
        let addrStr = "";
        try {
            addrStr = priv.toAddress(v.prefix as Network).toString();
        } catch (e) {
            addrStr = v.prefix + ":qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j";
        }
        
        console.log(`\nTesting ${v.name} -> ${addrStr}`);
        const res1 = await client.call("getBlockTemplate", { payAddress: addrStr, extraData: "" });
        console.log(`✅ String extraData OK`);
    } catch(e: any) {
        console.log(`❌ String extraData: ${e.message}`);
    }
}

await client.close();
await node.kill();
process.exit(0);
