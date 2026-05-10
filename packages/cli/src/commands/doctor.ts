import { Command } from "commander";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import pc from "picocolors";
import { handleError, UI } from "../ui.js";
import { loadHardkasConfig } from "@hardkas/config";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { HardkasStore } from "@hardkas/query-store";

export function registerDoctorCommand(program: Command) {
  program
    .command("doctor")
    .description("Perform a full system diagnostic and health report")
    .action(async () => {
      try {
        await runDoctor();
      } catch (err) {
        handleError(err);
      }
    });
}

async function runDoctor() {
  UI.box("HardKAS System Doctor", "Operational Health Check");

  // 1. Environment
  UI.header("Environment Status");
  UI.field("OS", `${os.type()} ${os.release()} (${os.arch()})`);
  UI.field("Node", process.version);
  UI.field("CWD", process.cwd());
  UI.divider();

  // 2. Config
  UI.header("Configuration Analysis");
  try {
    const loaded = await loadHardkasConfig({ cwd: process.cwd() });
    UI.success(`Config found: ${pc.cyan(path.basename(loaded.path || "unknown"))}`);
    UI.field("Default Network", loaded.config.defaultNetwork || "simnet");
  } catch (e: any) {
    UI.error("Configuration issues detected", e.message);
  }
  UI.divider();

  // 3. RPC Connectivity
  UI.header("RPC Connectivity & Health");
  try {
    const loaded = await loadHardkasConfig({ cwd: process.cwd() });
    const networkId = loaded.config.defaultNetwork || "simnet";
    const target = loaded.config.networks?.[networkId];
    
    let rpcUrl = "ws://127.0.0.1:18210"; 
    if ((target as any)?.rpcUrl) rpcUrl = (target as any).rpcUrl;

    UI.info(`Connecting to ${pc.cyan(rpcUrl)}...`);
    const rpc = new JsonWrpcKaspaClient({ rpcUrl });
    const info = await rpc.getInfo();
    
    UI.success(`RPC Alive: ${pc.bold(info.networkId)}`);
    UI.field("Synced", info.isSynced ? pc.green("YES") : pc.yellow("NO"));
    if (info.serverVersion) UI.field("Version", info.serverVersion);
  } catch (e: any) {
    UI.error("RPC Connection Failed", "Is the localnet or node running? Check your network config.");
  }
  UI.divider();

  // 4. Artifact Store
  UI.header("Artifact Store Integrity");
  const hardkasDir = path.join(process.cwd(), ".hardkas");
  try {
    const stats = await fs.stat(hardkasDir);
    if (stats.isDirectory()) {
      const files = await fs.readdir(hardkasDir);
      const artifacts = files.filter(f => f.endsWith(".json") && !f.endsWith(".enc.json"));
      UI.success(`Artifact directory .hardkas/ is active`);
      UI.field("Cached Artifacts", artifacts.length);
      
      const hasEvents = files.includes("events.jsonl");
      if (hasEvents) {
        UI.success("Observability event log (events.jsonl) is present");
      } else {
        UI.warning("Event log missing. Operational queries may be limited.");
      }
    }
  } catch {
    UI.error("Artifact Store not initialized", "Run 'hardkas init' to create a project.");
  }
  UI.divider();

  // 5. Query Store (SQLite)
  UI.header("Query Store (SQLite) Status");
  const dbPath = path.join(hardkasDir, "query.db");
  try {
    const store = new HardkasStore({ dbPath });
    store.connect();
    const db = store.getDatabase();
    
    const artCount = (db.prepare("SELECT COUNT(*) as count FROM artifacts").get() as any).count;
    const eventCount = (db.prepare("SELECT COUNT(*) as count FROM events").get() as any).count;
    
    UI.success("Relational index (query.db) is healthy");
    UI.field("Indexed Artifacts", artCount);
    UI.field("Indexed Events", eventCount);
    
    if (artCount === 0 && eventCount === 0) {
      UI.warning("Database is empty. Run 'hardkas query store index' to populate.");
    }
    
    store.disconnect();
  } catch (e: any) {
    UI.error("Query Store Issues", "The SQLite database might be corrupt or inaccessible.");
  }

  UI.footer("Use 'hardkas query' for deep operational introspection.");
}
