import { DockerKaspadRunner } from "@hardkas/node-runner";
import WebSocket from "ws";
(global as any).WebSocket = WebSocket;
import { kaspaRpcBackendPlugin } from "@hardkas/plugin-rpc-backend";
import { KaspaWrpcClient, checkKaspaRpcHealth } from "@hardkas/kaspa-rpc";
import { WalletToolkit } from "@hardkas/toolkit";
import { buildPaymentPlan, toTxBuilderUtxo } from "../../packages/tx-builder/src/index.js";
import { KaspaSdkRealTxSigner } from "../../packages/accounts/src/index.js";

async function main() {
    console.log("[1] Starting Kaspad Docker (latest)...");
    const runner = new DockerKaspadRunner({ network: "simnet" });
    await runner.start();

    try {
        console.log("[2] Waiting for node to sync...");
        await new Promise(r => setTimeout(r, 5000));

        console.log("[3] Connecting kaspaRpcBackendPlugin...");
        const backend = kaspaRpcBackendPlugin({
            url: "http://127.0.0.1:18210"
        });
        await backend.connect();

        console.log("[3] Testing blueScore...");
        console.log("[3] Testing blueScore...");
        const health = await checkKaspaRpcHealth({ url: "ws://127.0.0.1:18210" });
        console.log("BlueScore:", health.virtualDaaScore);

        const validAddr = "kaspasim:qzeglfst9pnvx7qvwk92khh2rvcy7qryyvkt40k8vnenqk9gv98evgp3y9vdz";
        console.log("Using real valid address:", validAddr);
        
        console.log("[4] Testing UTXO query...");
        const utxos = await backend.utxos(validAddr);
        console.log("UTXOs found:", utxos.length);

        console.log("[5] Testing balance query...");
        const balance = await backend.balance(validAddr);
        console.log("Balance:", balance);
        
        // Start of Phase B
        console.log("--- PHASE B: FULL L1 FLOW ---");
        const { exec } = await import('child_process');
        
        console.log("[B1] Mining blocks to validAddr...");
        const miner = exec(`.\\bin_go\\kaspaminer.exe --simnet -s 127.0.0.1:16210 --miningaddr ${validAddr} --mine-when-not-synced`);
        
        miner.stdout?.on('data', data => console.log('MINER: ' + data.trim()));
        miner.stderr?.on('data', data => console.error('MINER ERR: ' + data.trim()));

        await new Promise(r => setTimeout(r, 20000)); // wait 20 seconds
        miner.kill();
        console.log("Miner stopped.");

        await new Promise(r => setTimeout(r, 2000)); // wait a bit

        const balanceAfterMine = await backend.balance(validAddr);
        console.log(`Balance after mining: ${balanceAfterMine} sompi`);
        if (balanceAfterMine === 0n) {
            throw new Error("Failed to mine any spendable UTXOs!");
        }

        console.log("[B2] Fetching UTXOs...");
        const newUtxos = await backend.utxos(validAddr);
        console.log(`Found ${newUtxos.length} UTXOs`);

        console.log("[B3] Building and Signing transaction...");
        const availableUtxos = newUtxos.map((u: any) => {
            let amount = 0n;
            if (u.amountSompi !== undefined) amount = BigInt(u.amountSompi);
            else if (u.utxoEntry && u.utxoEntry.amount !== undefined) amount = BigInt(u.utxoEntry.amount);

            let spk = "";
            if (u.scriptPublicKey) {
                spk = typeof u.scriptPublicKey === "string" ? u.scriptPublicKey : (u.scriptPublicKey.scriptPublicKey || u.scriptPublicKey.script || "");
            } else if (u.utxoEntry && u.utxoEntry.scriptPublicKey) {
                spk = typeof u.utxoEntry.scriptPublicKey === "string" ? u.utxoEntry.scriptPublicKey : (u.utxoEntry.scriptPublicKey.scriptPublicKey || u.utxoEntry.scriptPublicKey.script || "");
            }

            return {
                outpoint: u.outpoint,
                address: validAddr,
                amountSompi: amount,
                scriptPublicKey: spk
            };
        });

        const plan = buildPaymentPlan({
            fromAddress: validAddr,
            outputs: [{ address: validAddr, amountSompi: 10000000000n }], // send 100 KAS back to ourselves
            availableUtxos,
            feeRateSompiPerMass: 10n,
            changeAddress: validAddr
        });

        console.log("SPK OF FIRST INPUT IN PLAN:", plan.inputs[0]?.scriptPublicKey);

        const signer = new KaspaSdkRealTxSigner();
        const signResult = await signer.sign({
            plan,
            account: {
                address: validAddr,
                privateKey: "1183a81ce99f792f4ffdfe17d102d420fceccd1ec89e4a4f16252dfff46d9f1c",
                type: "local",
                publicKey: "mock"
            } as any
        });

        console.log("Signed TX ID:", signResult.txId);

        console.log("[B4] Submitting Transaction via SDK...");
        const rpcSubmit = new KaspaWrpcClient("ws://127.0.0.1:18210");
        await rpcSubmit.connect();
        
        try {
            const payload = (signResult.signedTransaction as any).raw || signResult.signedTransaction.payload || signResult.signedTransaction;
            const txSubmitRes = await rpcSubmit.submitTransaction(
                payload,
                false
            ) as any;
            console.log("Submission successful. Node returned txId:", txSubmitRes.transactionId);
        } catch (submitErr) {
            console.log("Submit failed:", submitErr);
            throw submitErr;
        } finally {
            rpcSubmit.disconnect();
        }

        console.log("[B5] Awaiting confirmation (mining 1 block)...");
        const confirmMiner = exec(`.\\bin_go\\kaspaminer.exe --simnet -s 127.0.0.1:16210 --miningaddr ${validAddr} --mine-when-not-synced`);
        await new Promise(r => setTimeout(r, 5000)); // Mine for 5s to ensure block inclusion
        confirmMiner.kill();

        console.log("[B6] Validating Balance Update...");
        const finalBalance = await backend.balance(validAddr);
        console.log("Final Balance:", finalBalance, "sompi");

        console.log("Phase A and Phase B validations reaching completion...");
        await backend.disconnect();
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
        throw e;
    } finally {
        console.log("[X] Stopping Kaspad Docker...");
        await runner.stop();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
