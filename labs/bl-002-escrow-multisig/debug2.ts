import { RpcClient } from "../../../packages/kaspa-rpc/src/index.js";
import { DockerKaspadRunner } from "../shared/test-helpers.js";

async function run() {
    const runner = new DockerKaspadRunner({ network: "simnet", ports: { rpc: 16212, borshRpc: 17212, jsonRpc: 18212 } });
    await runner.start();
    console.log("Started");
    
    // Create a transaction...
    // Actually, I can just use SilverBridge to compile a tiny script:
    // contract Test() { entrypoint function foo() { require(tx.outputs[0].value == 2000000000); } }
    // But it's faster to just use the test output logs!
    
    await runner.stop();
}

run().catch(console.error);
