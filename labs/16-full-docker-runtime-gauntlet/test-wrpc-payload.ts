import { DockerKaspadRunner } from "@hardkas/node-runner";
import { KaspaWrpcClient } from "@hardkas/kaspa-rpc";

async function main() {
    const runner = new DockerKaspadRunner({ network: "simnet" });
    await runner.start();

    try {
        console.log("Waiting 10s for node...");
        await new Promise(r => setTimeout(r, 10000));
        const tempClient = new KaspaWrpcClient("ws://127.0.0.1:18210");
        await tempClient.connect();

        const validAddress = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
        const payloads = [
            { addresses: [validAddress] },
            { address: [validAddress] },
            { addresses: validAddress },
            [validAddress],
            { getUtxosByAddressesRequest: { addresses: [validAddress] } }
        ];

        for (const payload of payloads) {
            try {
                const res = await tempClient.request("getUtxosByAddresses", payload as any);
                console.log("Success with payload:", JSON.stringify(payload), res);
            } catch(e) {
                console.error("Failed with payload:", JSON.stringify(payload), e.message);
            }
        }

        tempClient.disconnect();

        console.log("DOCKER LOGS:");
        try {
            const execSync = require('child_process').execSync;
            console.log(execSync('docker logs hardkas-kaspad-simnet').toString());
        } catch(e) {}
    } finally {
        await runner.stop();
    }
}

main().catch(console.error);
