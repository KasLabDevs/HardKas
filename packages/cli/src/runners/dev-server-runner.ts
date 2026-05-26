import pc from "picocolors";
import { UI, handleError } from "../ui.js";
import path from "node:path";
import fs from "node:fs";

export async function runDevServer(options: { 
  port: string; 
  host: string; 
  unsafeExternal: boolean;
  showToken: boolean;
  open: boolean;
  json: boolean;
  once?: boolean;
  workspaceRoot?: string;
}) {
  const wsRoot = options.workspaceRoot || process.cwd();
  
  try {
    // 1. Workspace Verification
    const hardkasDir = path.join(wsRoot, ".hardkas");
    if (!fs.existsSync(hardkasDir)) {
      try {
        fs.mkdirSync(hardkasDir, { recursive: true });
      } catch (e) {
        throw new Error(`Workspace verification failed: Could not create .hardkas directory: ${e}`);
      }
    }

    // 2. Deterministic Bootstrap: Load/create deterministic localnet simulated state
    const { loadOrCreateLocalnetState } = await import("@hardkas/localnet");
    await loadOrCreateLocalnetState({
      cwd: wsRoot
    });

    if (!options.json && !options.once) {
      UI.info("Workspace verified. Localnet state bootstrapped deterministically.");
    }

    const { createDevServer, stopHardkasWatcher } = await import("@hardkas/dev-server");
    
    const port = parseInt(options.port, 10);
    let host = options.host;

    if (options.unsafeExternal && options.host === "localhost") {
      host = "0.0.0.0";
    }

    // 3. Early Port Availability Check & Server Init (before mutating SQLite)
    const server = createDevServer({
      port,
      host,
      unsafeExternal: options.unsafeExternal,
      open: options.open
    });

    // 4. SQLite Projection Rebuild: Atomically reconstruct index from filesystem artifacts
    const { HardkasStore, SqliteQueryBackend } = await import("@hardkas/query-store");
    const { withLock } = await import("@hardkas/core");
    
    const store = new HardkasStore({ dbPath: path.join(hardkasDir, "store.db") });
    store.connect({ autoMigrate: true });
    
    await withLock({ rootDir: wsRoot, name: "query-store", timeoutMs: 30000, wait: true }, async () => {
       const backend = new SqliteQueryBackend(store);
       await backend.rebuild({ strict: true });
    });

    if (!options.json && !options.once) {
      UI.success("Query-store projection indexes rebuilt atomically from filesystem artifacts.");
    }

    if (options.once) {
      store.disconnect();
      if (options.json) {
        UI.writeJson({ status: "initialized", headless: true });
      } else {
        UI.success("HardKAS dev environment initialized.");
      }
      return;
    }

    const serverObj = server as Record<string, unknown>;
    const token = typeof serverObj.token === "string" ? serverObj.token : undefined;

    if (options.json) {
      UI.writeJson({
        schema: "hardkas.devServer.v1",
        status: "running",
        url: `http://${host}:${port}`,
        token,
        config: { port, host, unsafeExternal: options.unsafeExternal }
      });
    } else {
      console.log(pc.bold("\nHardKAS dev-server started\n"));
      
      console.log(pc.bold("Dashboard:"));
      console.log(`  http://localhost:${port}\n`);

      console.log(pc.bold("Security:"));
      console.log(`  API authentication: ${pc.green("enabled")}`);
      console.log(`  CSRF protection: ${pc.green("enabled")}`);
      console.log(`  Host validation: ${options.unsafeExternal ? pc.yellow("disabled (unsafe-external mode)") : pc.green("enabled")}\n`);

      console.log(pc.bold("Token:"));
      console.log(`  generated for this session\n`);

      if (options.unsafeExternal) {
        console.log(pc.red("WARNING: --unsafe-external exposes the HardKAS dev-server beyond localhost."));
        console.log(pc.red("API token authentication remains enabled, but this mode increases workstation risk."));
        console.log(pc.red("Use only in isolated development environments.\n"));
      } else {
        console.log(pc.dim("Do not expose this server to untrusted networks.\n"));
      }

      if (options.showToken) {
        console.log(pc.bold("Session Token:"));
        console.log(`  ${token}\n`);

        console.log(pc.bold("Manual curl usage:"));
        console.log(`  curl -H "Authorization: Bearer ${token}" \\`);
        console.log(`       http://localhost:${port}/api/overview\n`);

        console.log(pc.bold("For mutations:"));
        console.log(`  curl -X POST \\`);
        console.log(`    -H "Authorization: Bearer ${token}" \\`);
        console.log(`    -H "X-Hardkas-Request: true" \\`);
        console.log(`    http://localhost:${port}/api/...\n`);
      }
    }

    const nodeServer = server.start();

    // 4. Safe Teardown on SIGINT/SIGTERM (Clean Exit, No background processes/threads left behind)
    let isStopping = false;
    const handleTeardown = async (signal: string) => {
      if (isStopping) return;
      isStopping = true;
      if (!options.json) {
        console.log(`\nStopping Dev Server (${signal})...`);
      }
      try {
        if (nodeServer && typeof (nodeServer as any).close === "function") {
          (nodeServer as any).close();
        }
        await stopHardkasWatcher();
        store.disconnect();
      } catch (e) {
        // Safe skip on close
      }
      process.exit(0);
    };

    process.on("SIGINT", () => handleTeardown("SIGINT"));
    process.on("SIGTERM", () => handleTeardown("SIGTERM"));

  } catch (e) {
    handleError(e);
  }
}
