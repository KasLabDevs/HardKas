import { KaspaWrpcClient } from "@hardkas/kaspa-rpc";
import * as sdk from "kaspa-wasm";

import { DockerKaspadRunner } from "@hardkas/node-runner";

async function testSubmit() {
    const runner = new DockerKaspadRunner({ network: "simnet" });
    await runner.start();
    await new Promise(r => setTimeout(r, 5000));
    
    const wrpcSubmit = new KaspaWrpcClient("ws://127.0.0.1:18210");
    try {
        const privHex = '1183a81ce99f792f4ffdfe17d102d420fceccd1ec89e4a4f16252dfff46d9f1c';
        const priv = new sdk.PrivateKey(privHex);
        const kp = priv.toKeypair();
        const addrStr = 'kaspasim:qzeglfst9pnvx7qvwk92khh2rvcy7qryyvkt40k8vnenqk9gv98evgp3y9vdz';
        const spk = new sdk.ScriptPublicKey(0, '20' + kp.publicKey.slice(2) + 'ac');
        
        const utxo = {
            address: addrStr,
            outpoint: { transactionId: 'a'.repeat(64), index: 0 },
            utxoEntry: { amount: 100000n, scriptPublicKey: spk, blockDaaScore: 0n, isCoinbase: false }
        };
        
        const out = new sdk.PaymentOutput(new sdk.Address(addrStr), 5000n);
        const tx = sdk.createTransaction([utxo], [out], addrStr, 10n);
        const signed = sdk.signTransaction(tx, [priv], true);
        
        let txPayload = JSON.parse(JSON.stringify(signed.tx.toJSON(), (_, v) => typeof v === 'bigint' ? Number(v) : v));
        
        txPayload.lockTime = txPayload.lock_time;
        delete txPayload.lock_time;
        txPayload.outputs.forEach((o: any) => {
            o.amount = o.value;
            delete o.value;
            if (o.scriptPublicKey) {
                o.scriptPublicKey.script = o.scriptPublicKey.scriptPublicKey || o.scriptPublicKey.script;
            }
        });
        
        // --- KEY FIXES FOR WRPC JSON DESERIALIZATION ---
        delete txPayload.id; 
        
        txPayload.lockTime = String(txPayload.lockTime || 0);
        txPayload.gas = "0";
        txPayload.mass = "0";
        txPayload.payload = txPayload.payload || "";

        for (const i of txPayload.inputs) {
            i.sequence = String(i.sequence);
        }

        for (const o of txPayload.outputs) {
            let versionStr = "0000";
            if (o.scriptPublicKey.version !== undefined) {
                versionStr = o.scriptPublicKey.version.toString(16).padStart(4, '0');
            }
            const scriptStr = o.scriptPublicKey.scriptPublicKey || o.scriptPublicKey.script;
            o.scriptPublicKey = versionStr + scriptStr;
            o.value = o.amount; // rename amount to value
            delete o.amount;
        }

        await wrpcSubmit.connect(5000);
        const req = {
            transaction: txPayload,
            allowOrphan: false
        };
        console.log("Submitting...", JSON.stringify(req, null, 2));
        const res = await wrpcSubmit.request("submitTransaction", req);
        console.log("Success:", res);
    } catch (e: any) {
        console.log("Failed with:", e);
    } finally {
        wrpcSubmit.disconnect();
        await runner.stop();
    }
}

testSubmit().catch(console.error);
