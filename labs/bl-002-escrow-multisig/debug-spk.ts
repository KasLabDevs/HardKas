import { RpcClient } from "../../../packages/kaspa-rpc/src/index.js";
import { DockerKaspadRunner, fundAndConfirm } from "../shared/test-helpers.js";
import kaspa from "kaspa-wasm";
import path from "node:path";
import util from "node:util";
import { exec } from "node:child_process";
import fs from "node:fs/promises";
import { sighashSigner } from "./tools/SighashSigner.js";

const execAsync = util.promisify(exec);

async function run() {
    const runner = new DockerKaspadRunner({ network: "simnet", ports: { rpc: 16212, borshRpc: 17212, jsonRpc: 18212 } });
    await runner.start();
    const rpc = new RpcClient({ rpcUrl: "ws://127.0.0.1:18212" });
    
    // Create a mock contract that we can use to extract OP_TXOUTPUTSCRIPTPUBKEY
    const privKey = new kaspa.PrivateKey("0000000000000000000000000000000000000000000000000000000000000001");
    const address = privKey.toKeypair().toAddress(kaspa.NetworkType.Simnet).toString();
    const spk = kaspa.payToAddressScript(address);
    console.log("Expected SPK script:", spk.substring(4)); // bypass length?
    
    // We will just let the test fail and we can try different prefixes manually in the test itself.
    await runner.stop();
}

run().catch(console.error);
