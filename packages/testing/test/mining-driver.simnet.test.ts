
import { SimnetNodeHarness } from "../src/simnet-node-harness.js";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";

async function runRegression() {
  console.log("Starting SimnetNodeHarness for mining regression...");
  const node = await SimnetNodeHarness.start({ utxoIndex: true });
  
  try {
    await node.waitUntilReady();
    console.log("Node is ready.");

    if (node.simulated === true) {
      throw new Error("Regression FAIL: Node is simulated. Simulated fallback must not happen.");
    }

    const client = new JsonWrpcKaspaClient({ rpcUrl: node.rpcUrl });
    const infoBefore = await client.getBlockDagInfo() as any;
    const daaBefore = infoBefore.virtualDaaScore ?? 0;
    
    console.log("Testing invalid address...");
    try {
      await node.mining.mineBlock({ payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j" });
      throw new Error("Regression FAIL: Invalid address should have thrown");
    } catch (e: any) {
      if (!e.message.includes("Block rejected") && !e.message.includes("request deserialization error")) {
         throw new Error("Unexpected error for invalid address: " + e.message);
      }
      console.log("? Invalid address rejected.");
    }

    console.log("Testing valid mining (should advance DAG)...");
    const result = await node.mining.mineBlock();
    if (result.hash === "simulated-block-hash") {
      throw new Error("Regression FAIL: Received simulated block hash");
    }
    
    // allow a brief moment for DAG to process the block
    await new Promise(r => setTimeout(r, 100));

    const infoAfter = await client.getBlockDagInfo() as any;
    const daaAfter = infoAfter.virtualDaaScore ?? 0;
    
    if (daaAfter <= daaBefore) {
      throw new Error(`Regression FAIL: DAG did not advance (before: ${daaBefore}, after: ${daaAfter})`);
    }
    
    console.log(`? Real mining succeeded and advanced DAG (${daaBefore} -> ${daaAfter}).`);
    
    await client.close();
  } finally {
    await node.kill();
  }
}

runRegression().then(() => {
  console.log("All regressions passed.");
  process.exit(0);
}).catch(e => {
  console.error("Regression test failed:", e);
  process.exit(1);
});

