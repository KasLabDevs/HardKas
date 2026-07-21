import { DockerKaspadRunner } from "@hardkas/node-runner";
import { KaspaWrpcClient } from "@hardkas/kaspa-rpc";

async function main() {
    console.log("[1] Starting Kaspad Docker (latest)...");
    const runner = new DockerKaspadRunner({ network: "simnet" });
    await runner.start();

    try {
        console.log("[2] Waiting for node to sync...");
        await new Promise(r => setTimeout(r, 5000));

        const client = new KaspaWrpcClient("ws://127.0.0.1:18210");
        await client.connect();
        
        try {
            console.log("Calling getUtxosByAddresses...");
            const res = await client.request("getUtxosByAddresses", { addresses: ["kaspasim:qzr380cvw26xem5qlytdzrtf6r9twn4ksr49pzwgysvj359m4h3ms6m6k7p2d"] });
            console.log("Result:", res);
        } catch (e) {
            console.error("Error with addresses:", e);
        }

        try {
            console.log("Calling getUtxosByAddressesRequest directly...");
            const res = await client.request("getUtxosByAddressesRequest", { addresses: ["kaspasim:qzr380cvw26xem5qlytdzrtf6r9twn4ksr49pzwgysvj359m4h3ms6m6k7p2d"] });
            console.log("Result:", res);
        } catch (e) {
            console.error("Error with addresses directly:", e);
        }

        await client.disconnect();
    } catch(e) {
        console.error(e);
        console.log("DOCKER LOGS:");
        try {
            const execSync = (await import('child_process')).execSync;
            const logs = execSync('docker logs hardkas-kaspad-simnet').toString();
            console.log(logs);
        } catch(err) {
            console.log("Could not get logs", err);
        }
    } finally {
        console.log("[X] Stopping Kaspad Docker...");
        await runner.stop();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
