import { DockerKaspadRunner } from "@hardkas/node-runner";
import { kaspaRpcBackendPlugin } from "@hardkas/plugin-rpc-backend";
import { WalletToolkit } from "@hardkas/toolkit";
import { spawn } from "child_process";
import fs from "fs";

async function main() {
    console.log("[1] Starting Kaspad Docker (latest)...");
    const runner = new DockerKaspadRunner({ network: "simnet" });
    await runner.start();

    // Start a background miner using docker
    console.log("[2] Starting fixture miner...");
    const miner = spawn("docker", [
        "run", "--rm", "--name", "test-fixture-miner", "--network", "host",
        "hardkas/kaspa-miner:latest",
        "/app/kaspa-miner", "--simnet", "--miningaddr", "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e",
        "--rpcserver", "127.0.0.1:16210"
    ]);

    try {
        console.log("[3] Connecting Backend...");
        const backend = kaspaRpcBackendPlugin({
            url: "ws://127.0.0.1:18210"
        });
        await backend.connect();

        console.log("[4] Opening WalletToolkit...");
        // Wait, WalletToolkit isn't fully implemented with L1 yet, let's just see if we can do something
        const wallet = WalletToolkit.open("test-wallet", { network: "simnet" });
        await wallet.create();
        const address = await wallet.address();
        console.log("Wallet address:", address);

        // We will need to wait for funds or use the mining address.
        console.log("Checking balance...");
        const balance = await backend.balance(address);
        console.log("Balance:", balance);

        console.log("Phase B basic check complete");
        await backend.disconnect();
    } finally {
        console.log("[X] Stopping miner...");
        spawn("docker", ["rm", "-f", "test-fixture-miner"]);
        console.log("[X] Stopping Kaspad Docker...");
        await runner.stop();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
