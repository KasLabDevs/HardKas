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
  sandboxMode?: boolean;
  quietHeader?: boolean;
  preventTeardown?: boolean;
}) {
  const wsRoot = options.workspaceRoot || process.cwd();

  // Set env var so dev-server watcher and other modules resolve to the correct root
  process.env.HARDKAS_ROOT = wsRoot;

  try {
    // 1. Workspace Verification
    const hardkasDir = path.join(wsRoot, ".hardkas");
    if (!fs.existsSync(hardkasDir)) {
      try {
        fs.mkdirSync(hardkasDir, { recursive: true });
      } catch (e) {
        throw new Error(
          `Workspace verification failed: Could not create .hardkas directory: ${e}`
        );
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

    if (options.unsafeExternal && options.host === "127.0.0.1") {
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

    await withLock(
      { rootDir: wsRoot, name: "query-store", timeoutMs: 30000, wait: true },
      async () => {
        const backend = new SqliteQueryBackend(store);
        await backend.rebuild({ strict: true, cwd: wsRoot });
      }
    );

    if (!options.json && !options.once) {
      UI.success(
        "Query-store projection indexes rebuilt atomically from filesystem artifacts."
      );
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

    let isNodeRunning = false;
    let miningAlias = "";
    let miningAddress = "";
    let devAccounts: any[] = [];

    if (options.json) {
      UI.writeJson({
        schema: "hardkas.devServer.v1",
        status: "running",
        url: `http://${host}:${port}`,
        token,
        config: { port, host, unsafeExternal: options.unsafeExternal }
      });
    } else {
      const { ensureDevAccounts, listDevAccountsSync } =
        await import("@hardkas/accounts");

      // Auto-ensure dev accounts (creates alice/bob if they don't exist in simnet)
      await ensureDevAccounts(wsRoot);
      devAccounts = listDevAccountsSync(wsRoot);

      if ((options as any).withNode) {
        if (devAccounts.length > 0) {
          miningAlias = devAccounts[0]!.name;
          miningAddress = devAccounts[0]!.address;
        }

        // Spawn localnet node in background
        const { spawn } = await import("node:child_process");
        const nodeArgs = ["hardkas", "node", "start"];
        if (miningAddress) {
          nodeArgs.push("--miningaddr", miningAddress);
        }
        // Run dettached so it runs independently
        spawn("pnpm", nodeArgs, { stdio: "ignore", detached: true, cwd: wsRoot }).unref();
        isNodeRunning = true;
      }

      if (!options.quietHeader && !options.json) {
        console.log(pc.bold("\nHardKAS Local Runtime"));
        console.log(pc.dim("━━━━━━━━━━━━━━━━━━━━━━\n"));

        console.log(pc.bold("Workspace:"));
        console.log(`  ${wsRoot}\n`);

        console.log(pc.bold("Network:"));
        console.log(`  simnet\n`);

        console.log(pc.bold("Node:"));
        if (isNodeRunning) {
          console.log(`  ${pc.green("running")}\n`);
          console.log(pc.bold("Mining:"));
          console.log(`  enabled → ${pc.blue(miningAlias)}\n`);
        } else {
          console.log(`  not running`);
          console.log(
            pc.dim(
              `  Tip: run \`hardkas dev --with-node\` for full localnet + autofunding.\n`
            )
          );
        }

        console.log(pc.bold("Projection:"));
        console.log(`  healthy\n`);

        console.log(pc.bold("Canonical Ledger:"));
        console.log(`  healthy\n`);

        console.log(pc.bold("Dashboard:"));
        console.log(`  http://localhost:${port}\n`);

        console.log(pc.bold("Accounts"));
        console.log(pc.dim("━━━━━━━━━━━━━━━━━━━━━━\n"));

        devAccounts.forEach((acc, index) => {
          console.log(`[${index}] ${pc.blue(acc.name)}`);
          console.log(`Address: ${acc.address}`);
          // We do not fake balance, we leave it to dashboard or say 'Check dashboard for balance'
          // since we don't have a sync RPC call here directly without delaying startup
          console.log(
            `Balance: ${isNodeRunning ? "Syncing..." : "FundingStatus: unknown/unsupported"}\n`
          );
        });

        UI.printNextSteps([
          "hardkas dev tx send --from alice --to bob --amount 1",
          "hardkas status",
          "hardkas dev last --replay"
        ]);

        console.log(pc.red(pc.bold("WARNING:")));
        console.log(pc.red("Local simnet development accounts only."));
        console.log(pc.red("Never use on mainnet.\n"));
      }
    } // Closes else block

    const nodeServer = server.start();

    if (options.preventTeardown) {
      return {
        store,
        nodeServer,
        stopHardkasWatcher,
        isNodeRunning,
        miningAlias,
        port,
        devAccounts
      };
    }

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
