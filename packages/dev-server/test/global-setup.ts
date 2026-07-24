import { createDevServer } from "../src/server.js";
import { SimnetNodeHarness } from "../../testing/src/simnet-node-harness.js";
import { getOrCreateDevAccount } from "@hardkas/accounts";

let server: any;
let harness: any;

export async function setup() {
  console.log("Starting SimnetNodeHarness...");
  try {
    harness = await SimnetNodeHarness.start({
      rpcPort: 18210,
      utxoIndex: true,
      startupTimeoutMs: 60000
    });
    console.log("SimnetNodeHarness started successfully.");
  } catch (err) {
    console.error("Failed to start harness:", err);
    throw err;
  }

  console.log("Waiting for node to become ready...");
  await harness.waitUntilReady();
  console.log("Node is ready. Funding alice...");

  // Fund alice
  const alice = await getOrCreateDevAccount(process.cwd(), 0, "alice");
  
  // Wait for node to stabilize
  await new Promise(r => setTimeout(r, 2000));

  // Mine blocks to Alice to mature UTXOs (maturity is 1000)
  await harness.mining.mineBlocks(1050, {
    payAddress: alice.address
  });
  
  // Wait for UTXO index to catch up
  await new Promise(r => setTimeout(r, 2000));

  const instance = createDevServer({
    port: 3000,
    host: "127.0.0.1",
    unsafeNoAuth: true
  });
  server = instance.start();

  // Start a background miner so that transactions broadcast during tests get mined
  const minerInterval = setInterval(async () => {
    try {
      console.log("Mining block in background...");
      await harness.mining.mineBlocks(1, { payAddress: alice.address });
      console.log("Mined block in background");
    } catch (e: any) {
      console.error("Background miner error:", e.message);
    }
  }, 1000);
  
  (server as any)._minerInterval = minerInterval;

  await new Promise((resolve) => setTimeout(resolve, 500));
}

export async function teardown() {
  if (server) {
    if ((server as any)._minerInterval) clearInterval((server as any)._minerInterval);
    server.close();
  }
  if (harness) {
    await harness.stop();
  }
}
