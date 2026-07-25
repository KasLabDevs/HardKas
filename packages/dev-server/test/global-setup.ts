import { createDevServer } from "../src/server.js";
import { stopHardkasWatcher } from "../src/watcher.js";
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
    console.log("Waiting for node to become ready...");
    await harness.waitUntilReady();
    console.log("Node is ready. Funding alice...");

    // Fund alice
    const alice = await getOrCreateDevAccount(process.cwd(), 0, "alice");
    const burnerAddress = "simnet:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzcxw";
    
    // Wait for node to stabilize
    await new Promise(r => setTimeout(r, 2000));

    // Mine 50 blocks to Alice
    await harness.mining.mineBlocks(50, { payAddress: alice.address });
    // Mine 1000 blocks to burner address to mature Alice's UTXOs without spamming her wallet
    await harness.mining.mineBlocks(1000, { payAddress: burnerAddress });
    
    // Wait for UTXO index to catch up
    await new Promise(r => setTimeout(r, 2000));

    // Start a background miner so that transactions broadcast during tests get mined
    const minerInterval = setInterval(async () => {
      try {
        await harness.mining.mineBlocks(1, { payAddress: burnerAddress });
      } catch (e: any) {
        // Ignore minor miner conflicts in background
      }
    }, 3000);
    
    (global as any)._minerInterval = minerInterval;
  } catch (err: any) {
    console.warn("[GlobalSetup] Simnet node could not be started (Docker unavailable or error):", err.message);
    console.warn("[GlobalSetup] Proceeding with dev-server without real simnet connectivity.");
  }

  const instance = createDevServer({
    port: 3000,
    host: "127.0.0.1",
    unsafeNoAuth: true
  });
  server = instance.start();
  if ((global as any)._minerInterval) {
    (server as any)._minerInterval = (global as any)._minerInterval;
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
}

export async function teardown() {
  stopHardkasWatcher();
  if ((global as any)._minerInterval) {
    clearInterval((global as any)._minerInterval);
    (global as any)._minerInterval = undefined;
  }
  if (server) {
    if ((server as any)._minerInterval) clearInterval((server as any)._minerInterval);
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    server.close();
  }
  if (harness) {
    await harness.stop();
  }
}
