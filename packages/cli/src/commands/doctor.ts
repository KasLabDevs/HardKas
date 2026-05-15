import { Command } from "commander";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import pc from "picocolors";
import { handleError, UI } from "../ui.js";
import { loadHardkasConfig } from "@hardkas/config";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { HardkasStore } from "@hardkas/query-store";
import { DockerKaspadRunner } from "@hardkas/node-runner";
import { execa } from "execa";

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

  // 3. Docker & Local Node Health
  UI.header("Docker & Local Node Health");
  let dockerCliOk = false;
  try {
    await execa("docker", ["version"]);
    UI.success("Docker CLI is available");
    dockerCliOk = true;
  } catch {
    UI.error("Docker CLI missing", "Please install Docker to manage local nodes.");
    UI.info("Skipping further Docker-dependent checks.");
  }

  if (dockerCliOk) {
    let daemonOk = false;
    try {
      await execa("docker", ["info"]);
      UI.success("Docker daemon is reachable");
      daemonOk = true;
    } catch {
      UI.error("Docker daemon unreachable", "Ensure Docker Desktop or the docker daemon is running.");
      UI.info("Skipping image and container checks.");
    }

    if (daemonOk) {
      const runner = new DockerKaspadRunner();
      const status = await runner.status();

      UI.field("Configured Image", status.image);
      if (status.image.endsWith(":latest")) {
        UI.warning("Using :latest image. Reproducibilidad is reduced.");
      } else {
        UI.success("Using pinned image tag");
      }

      UI.field("Container", `${status.containerName} (${status.statusText})`);
      
      if (status.running) {
        UI.success("Local node container is running");
        UI.field("RPC Status", status.rpcReady ? pc.green("READY") : pc.red("NOT READY"));
        if (!status.rpcReady && status.lastError) {
          UI.error("RPC Error", status.lastError);
          UI.info("Try checking logs: hardkas node logs --tail 200");
        }
      } else {
        UI.info("Local node container is not running.");
      }
    }
  }
  UI.divider();

  // 4. Custom RPC Connectivity
  UI.header("Custom RPC Connectivity");

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
  const dbPath = path.join(hardkasDir, "store.db");
  try {
    const store = new HardkasStore({ dbPath });
    store.connect();
    const db = store.getDatabase();
    
    const artCount = (db.prepare("SELECT COUNT(*) as count FROM artifacts").get() as any).count;
    const eventCount = (db.prepare("SELECT COUNT(*) as count FROM events").get() as any).count;
    
    UI.success("Relational index (store.db) is healthy");
    UI.field("Indexed Artifacts", artCount);
    UI.field("Indexed Events", eventCount);
    
    if (artCount === 0 && eventCount === 0) {
      UI.warning("Database is empty. Run 'hardkas query store rebuild' to populate.");
    }
    
    store.disconnect();
  } catch (e: any) {
    UI.error("Query Store Issues", "The SQLite database might be corrupt or inaccessible. Run 'hardkas query store rebuild' to repair.");
  }

  UI.footer("Use 'hardkas query' for deep operational introspection.");
}
