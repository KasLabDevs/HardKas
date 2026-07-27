import { DockerKaspadRunner } from "@hardkas/node-runner";
// Inject WebSocket into global scope so kaspa-wasm can use it in NodeJS
import WebSocket from "ws";
(global as any).WebSocket = WebSocket;

import * as sdk from "kaspa-wasm";

async function testSubmit() {
    const runner = new DockerKaspadRunner({ network: "simnet" });
    await runner.start();
    await new Promise(r => setTimeout(r, 5000));
    
    try {
        console.log("Loading WASM...");
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
        
        console.log("Connecting SDK RpcClient...");
        const rpc = new sdk.RpcClient("ws://127.0.0.1:18210");
        await rpc.connect();
        
        console.log("Submitting with SDK...");
        const res = await rpc.submitTransaction(signed.tx, false);
        console.log("Success:", res);
        
        await rpc.disconnect();
    } catch (e: any) {
        console.log("Failed with:", e);
    }
}

testSubmit().catch(console.error);
