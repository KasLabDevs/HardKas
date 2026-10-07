import pc from "picocolors";
import { UI, handleError } from "../ui.js";
import path from "node:path";
import fs from "node:fs";
import { HardkasSchemas } from "@hardkas/artifacts";

export async function runDevServer(options: {
  port: string;
  host: string;
  unsafeExternal: boolean;
  unsafeNoAuth?: boolean;
  showToken?: boolean;
  open: boolean;
  json: boolean;
  once?: boolean;
  workspaceRoot?: string;
  sandboxMode?: boolean;
  quietHeader?: boolean;
  preventTeardown?: boolean;
}) {
  const wsRoot = options.workspaceRoot || process.cwd();

  // SURFACE-TRUTH-1A (ST-I3): this runner starts no node; a request for one is refused, never ignored
  if ((options as { withNode?: boolean }).withNode) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "DEV_WITH_NODE_UNSUPPORTED",
      "The dev server does not start a node. Start the Docker localnet with `hardkas localnet start`.",
      { exitCode: 1 }
    );
  }

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

    const server = createDevServer({
      port,
      host,
      unsafeExternal: options.unsafeExternal,
      unsafeNoAuth: options.unsafeNoAuth ?? false,
      open: options.open
    });

    const serverObj = server as Record<string, unknown>;
    const token = typeof serverObj.token === "string" ? serverObj.token : undefined;
    // a `--once` run starts no server, so it leaves no token behind
    if (token && !options.once) {
      fs.writeFileSync(path.join(hardkasDir, "dev-server-token"), token, { mode: 0o600 });
    }

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


    let devAccounts: any[] = [];

    if (options.json) {
      UI.writeJson({
        schema: HardkasSchemas.DevServerV1,
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

      // SURFACE-TRUTH-1A (ST-I3): the banner states only what this run did or checked. Gone: a hard-coded
      // "Network: simnet"; "Node: running" / "Mining: enabled", set after spawning a detached
      // `pnpm hardkas node start --miningaddr …` (an option `node start` does not have) without checking anything;
      // "Node: not running", which nothing checked either; and a "Canonical Ledger: healthy" no check backed.
      if (!options.quietHeader && !options.json) {
        console.log(pc.bold("\nHardKAS Local Runtime"));
        console.log(pc.dim("━━━━━━━━━━━━━━━━━━━━━━\n"));

        console.log(pc.bold("Workspace:"));
        console.log(`  ${wsRoot}\n`);

        console.log(pc.bold("Projection:"));
        console.log(`  rebuilt from the workspace artifacts\n`);

        console.log(pc.bold("Dashboard:"));
        console.log(`  http://localhost:${port}\n`);

        console.log(pc.bold("Accounts"));
        console.log(pc.dim("━━━━━━━━━━━━━━━━━━━━━━\n"));

        devAccounts.forEach((acc, index) => {
          console.log(`[${index}] ${pc.blue(acc.name)}`);
          console.log(`Address: ${acc.address}`);
          // We do not fake balance: no balance is looked up here, the dashboard shows it
          console.log(`Balance: see the dashboard\n`);
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
      try {
        if (fs.existsSync(path.join(hardkasDir, "dev-server-token"))) {
          fs.unlinkSync(path.join(hardkasDir, "dev-server-token"));
        }
      } catch (e) {}
      process.removeAllListeners("SIGINT");
      process.removeAllListeners("SIGTERM");
      process.kill(process.pid, signal as NodeJS.Signals);
    };

    process.on("SIGINT", () => handleTeardown("SIGINT"));
    process.on("SIGTERM", () => handleTeardown("SIGTERM"));

    // Block forever so the CLI doesn't exit immediately
    await new Promise(() => {});
  } catch (e) {
    handleError(e);
  }
}

export async function runDevServerToken(options: { json?: boolean; workspaceRoot?: string }) {
  const wsRoot = options.workspaceRoot || process.cwd();
  const tokenPath = path.join(wsRoot, ".hardkas", "dev-server-token");
  if (!fs.existsSync(tokenPath)) {
    throw new Error("Dev server is not running or token file not found.");
  }
  const token = fs.readFileSync(tokenPath, "utf8").trim();
  if (options.json) {
    UI.writeJson({ token });
  } else {
    console.log(token);
  }
}
