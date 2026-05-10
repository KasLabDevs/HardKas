import { UI } from "../ui.js";
import { loadHardkasConfig } from "@hardkas/config";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { listHardkasAccounts } from "@hardkas/accounts";
import fs from "node:fs/promises";
import path from "node:path";

export async function runUp() {
  UI.box("HardKAS", "Environment Bootstrapper");
  
  try {
    // 1. Load config
    const loaded = await loadHardkasConfig();
    const networkId = loaded.config.defaultNetwork || "simulated";
    UI.info(`\x1b[1mNetwork Mode:\x1b[0m ${networkId} (${loaded.config.networks?.[networkId]?.kind || "default"})`);
    UI.info(`\x1b[1mConfig:\x1b[0m       ${loaded.path || "defaults"}`);
    console.log("");

    // 2. Ensure directories
    const runtimeDir = path.join(loaded.cwd, ".hardkas", "runtime");
    const receiptsDir = path.join(loaded.cwd, ".hardkas", "receipts");
    
    await fs.mkdir(runtimeDir, { recursive: true });
    await fs.mkdir(receiptsDir, { recursive: true });
    
    UI.info("\x1b[1mRuntime:\x1b[0m");
    
    // 3. Check RPC
    const target = loaded.config.networks?.[networkId];
    let rpcUrl = "ws://127.0.0.1:18210";
    if (target) {
      if (target.kind === "kaspa-rpc" || target.kind === "igra") {
        rpcUrl = target.rpcUrl;
      } else if (target.kind === "kaspa-node" && target.rpcUrl) {
        rpcUrl = target.rpcUrl;
      }
    }
    
    const client = new JsonWrpcKaspaClient({ rpcUrl });
    try {
      const health = await client.healthCheck();
      if (health.reachable) {
        UI.success(`RPC available at ${rpcUrl}`);
      } else {
        console.log(`  \x1b[33m⚠\x1b[0m RPC not reachable at ${rpcUrl}. Run 'hardkas node start' or check kaspad.`);
      }
    } catch (e) {
      console.log(`  \x1b[33m⚠\x1b[0m RPC check failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await client.close();
    }

    UI.success(`State directory:    .hardkas/runtime`);
    UI.success(`Receipts directory: .hardkas/receipts`);
    console.log("");

    // 4. Accounts
    UI.info("\x1b[1mAccounts:\x1b[0m");
    const accounts = listHardkasAccounts(loaded.config);
    if (accounts.length > 0) {
      for (const acc of accounts) {
        UI.success(`${acc.name} (${acc.kind})`);
      }
    } else {
      console.log("  No accounts defined in config.");
    }
    console.log("");

    UI.info("\x1b[32m✓\x1b[0m \x1b[1mHardKAS is UP and ready for development.\x1b[0m");
    UI.footer("Try running: pnpm example:localnet");
  } catch (error) {
    throw error;
  }
}
