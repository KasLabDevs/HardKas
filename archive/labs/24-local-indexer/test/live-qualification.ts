import { Hardkas } from "@hardkas/sdk";
import { LocalIndexer } from "../src/indexer.js";
import fs from "fs";
import path from "path";
import { setTimeout } from "timers/promises";

async function runLiveQualification() {
  console.log("=== Phase 8 Live Qualification ===");
  const dbPath = path.join(process.cwd(), "live-indexer.db");
  
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  // Use a random tracked address for the test to avoid interference
  const trackedAddress = "kaspa:sim_live_qualification_test_address";
  
  // Create SDK instance for orchestrating the test
  const sdk = await Hardkas.create({ autoBootstrap: true });
  console.log(`Connected to: ${(await sdk.rpc.getServerInfo()).networkId}`);
  
  console.log("\n--- Gate L1: Active live ---");
  const indexer = new LocalIndexer(dbPath, [trackedAddress]);
  
  console.log("Starting indexer in background...");
  // Start indexer and wait for it to bootstrap
  const indexerPromise = indexer.start();
  await setTimeout(2000); // Give it time to bootstrap
  
  console.log("Generating activity...");
  // Get initial state
  const initialDag = await sdk.rpc.getBlockDagInfo();
  
  // We need to trigger a virtualChainChanged and utxosChanged event.
  // In a real localnet, we can mine blocks or send transactions.
  // Assuming this is connected to a local kaspad simnet, we can try to call mineBlock if the RPC supports it,
  // or we can just observe if it's a real network. Since we don't have a direct "mine" command in the standard public RPC,
  // we might need to rely on the HardKAS localnet manager if it's available, or just log the capability gap.
  
  try {
    // Attempt to use HardKAS localnet features if they are exposed
    if (sdk.localnet && typeof (sdk.localnet as any).mineBlocks === 'function') {
        console.log("Mining block via sdk.localnet...");
        await (sdk.localnet as any).mineBlocks(1);
    } else {
        console.log("sdk.localnet.mineBlocks not available. Falling back to simple wait to see if network is naturally active...");
    }
  } catch (e: any) {
    console.log("Mining failed (expected if not a managed localnet):", e.message);
  }

  await setTimeout(2000); // Wait for events to process

  const projectionCount = indexer.getProjectionCount();
  const eventCount = indexer.getEventLogCount();
  const cursor = indexer.getCursor();
  
  console.log(`Projection count: ${projectionCount}`);
  console.log(`Event count: ${eventCount}`);
  console.log(`Cursor:`, cursor);

  // Stop the first indexer (we don't have a clean stop method, so we just let it be GC'd or we can't easily kill it without exiting the process if it's not a separate process.
  // Wait, if it's in the same process, we can't easily "kill" it if it's listening to events.
  // For Gate L3/L4, we should run the indexer in a separate child process to properly simulate kill/restart.
  
  console.log("\n--- NOTE ---");
  console.log("To properly test Gate L2, L3, and L4 (unstable bootstrap, offline gap, kill/restart), we need to run the indexer in a separate process and kill it.");
  console.log("This orchestrator script will now exit. Please run the separate gate scripts.");
  
  process.exit(0);
}

runLiveQualification().catch(console.error);
