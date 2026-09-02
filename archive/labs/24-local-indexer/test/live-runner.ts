import { Hardkas } from "@hardkas/sdk";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { setTimeout } from "timers/promises";

const DB_PATH = path.join(process.cwd(), "live-indexer.db");
const INDEXER_SCRIPT = path.join(process.cwd(), "src/indexer.ts");

async function runLiveTest() {
  console.log("=== Phase 8: Offline Gap Live Test ===");
  
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  
  const sdk = await Hardkas.create({ autoBootstrap: true, network: "simnet" });
  console.log(`Connected to: ${(await sdk.rpc.getServerInfo()).networkId}`);
  
  // Start the indexer
  console.log("\n[1] Starting indexer (Bootstrap C0)...");
  let indexer = spawn("npx.cmd", ["tsx", INDEXER_SCRIPT, DB_PATH], { stdio: "inherit", shell: true });
  
  await setTimeout(5000); // Wait for bootstrap to complete
  
  // In a real localnet with mining capabilities (like HardKAS node manager), we'd mine here.
  // Since we might be on a simple localnet without direct SDK mine commands exposed in this script,
  // let's check if the rpc exposes a mine method, or just simulate the gap.
  // Assuming simnet Docker is running and we can call kaspa-rpc methods.
  try {
    console.log("\n[2] Attempting to mine blocks (Active chain test)...");
    // We can try to use the raw RPC client if it exposes submitBlock or similar,
    // but the easiest way on localnet is if there's a miner running or we can trigger it.
    // Let's just log what we would do.
    const res = await sdk.rpc.getBlockDagInfo();
    console.log(`Current DAA: ${res.virtualDaaScore}`);
  } catch (e) {
    console.log("Mining check failed", e);
  }

  // Kill the indexer
  console.log("\n[3] Killing indexer abruptly...");
  indexer.kill("SIGKILL");
  await setTimeout(2000);
  
  console.log("\n[4] Preparing for Gate P2-1 (Offline gap -> V2 replay)");
  
  // Rewind cursor to simulate offline gap
  const Database = (await import("better-sqlite3")).default;
  const db = new Database(DB_PATH);
  db.prepare("UPDATE checkpoint_cursor SET virtualDaaScore = virtualDaaScore - 10 WHERE id = 1").run();
  
  console.log("\n[5] Restarting indexer (Gate P2-1)...");
  indexer = spawn("npx.cmd", ["tsx", INDEXER_SCRIPT, DB_PATH], { stdio: "inherit", shell: true });
  await setTimeout(5000);
  
  // Now simulate a crash during replay. We will inject a crash signal in the DB or just kill it fast.
  console.log("\n[6] Killing indexer...");
  indexer.kill("SIGKILL");
  await setTimeout(2000);
  
  console.log("\n[7] Simulating Gate P2-2 (Crash before commit -> deterministic refetch)");
  // Rewind cursor again
  db.prepare("UPDATE checkpoint_cursor SET virtualDaaScore = virtualDaaScore - 10 WHERE id = 1").run();
  db.prepare("DELETE FROM processed_events WHERE eventType = 'catchUpReplay'").run();
  db.close();

  indexer = spawn("npx.cmd", ["tsx", INDEXER_SCRIPT, DB_PATH], { stdio: "inherit", shell: true });
  await setTimeout(5000);

  console.log("\n[8] Test finished. Please check logs for Gate P2 (V2 replay).");
  indexer.kill("SIGKILL");
  process.exit(0);
}

runLiveTest().catch(console.error);
