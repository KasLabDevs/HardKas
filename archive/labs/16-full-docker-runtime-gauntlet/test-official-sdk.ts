import { DockerKaspadRunner } from "@hardkas/node-runner";
import { RpcClient } from "kaspa-wasm";

async function main() {
    const runner = new DockerKaspadRunner({ network: "simnet" });
    await runner.start();

    try {
        console.log("Waiting 5s for node...");
        await new Promise(r => setTimeout(r, 5000));
        
        const rpc = new RpcClient({
            networkId: "simnet",
            url: "ws://127.0.0.1:18210"
        });
        
        await rpc.connect();
        
        console.log("Connected to Kaspa RPC!");
        
        const info = await rpc.getServerInfo();
        console.log("Server Info:", info);
        
        const dag = await rpc.getBlockDagInfo();
        console.log("DAG Info:", dag);

        try {
            const utxos = await rpc.getUtxosByAddresses({ addresses: ["kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e"] });
            console.log("UTXOs:", utxos);
        } catch(e) {
            console.log("UTXO Error:", e);
        }

        await rpc.disconnect();
    } finally {
        await runner.stop();
    }
}

main().catch(console.error);
