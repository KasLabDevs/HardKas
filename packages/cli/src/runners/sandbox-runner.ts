import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import pc from "picocolors";
import { UI, handleError } from "../ui.js";
import runTransferRecipe from "../recipes/transfer.js";
import runProjectionRebuildRecipe from "../recipes/projection-rebuild.js";
import runReplayFailureRecipe from "../recipes/replay-failure.js";

export async function runSandbox(options: {
  withNode?: boolean;
  recipe?: string;
  port?: string;
  host?: string;
}) {
  try {
    const tmpdir = os.tmpdir();
    const sandboxRoot = fs.mkdtempSync(path.join(tmpdir, "hardkas-sandbox-"));

    // Ensure we can safely delete later
    fs.writeFileSync(path.join(sandboxRoot, ".hardkas-sandbox-target"), "ephemeral");

    const port = options.port || "3000";
    const host = options.host || "localhost";

    UI.info(`Initializing temporary sandbox at ${sandboxRoot}`);

    // Load necessary runners dynamically to avoid circular issues
    const { runDevServer } = await import("./dev-server-runner.js");

    // We start the dev server, suppressing its teardown handles and header
    const devCtx: any = await runDevServer({
      port,
      host,
      unsafeExternal: false,
      showToken: false,
      open: false,
      json: false,
      workspaceRoot: sandboxRoot,
      sandboxMode: true,
      quietHeader: true,
      preventTeardown: true,
      withNode: options.withNode
    } as any);

    const isNodeRunning = devCtx?.isNodeRunning || false;
    const miningAlias = devCtx?.miningAlias || "alice";

    // Main Sandbox Banner
    console.log(pc.bold("\nHardKAS Sandbox Runtime"));
    console.log(pc.dim("━━━━━━━━━━━━━━━━━━━━━━━\n"));

    console.log(pc.bold("Workspace:"));
    console.log(`  ${sandboxRoot}\n`);

    console.log(pc.bold("Network:"));
    console.log(`  simnet\n`);

    console.log(pc.bold("Mode:"));
    console.log(`  ephemeral\n`);

    console.log(pc.bold("Node:"));
    if (isNodeRunning) {
      console.log(`  ${pc.green("running")}\n`);
      console.log(pc.bold("Mining:"));
      console.log(`  enabled → ${pc.blue(miningAlias)}\n`);
    } else {
      console.log(`  not running`);
      console.log(
        pc.dim(
          `  Tip: run \`hardkas sandbox --with-node\` for full localnet + autofunding.\n`
        )
      );
    }

    console.log(pc.bold("Dashboard:"));
    console.log(`  http://${host}:${port}\n`);

    console.log(pc.bold("Artifacts:"));
    console.log(`  ephemeral\n`);

    console.log(pc.bold("Projection:"));
    console.log(`  healthy\n`);

    console.log(pc.bold("Quick Start"));
    console.log(pc.dim("━━━━━━━━━━━━━━━━━━━━━━━\n"));

    console.log(`cd ${sandboxRoot}\n`);

    UI.printNextSteps([
      `hardkas status --workspace ${sandboxRoot}`,
      `hardkas dev tx send --from alice --to bob --amount 1 --workspace ${sandboxRoot}`,
      `hardkas dev last --replay --workspace ${sandboxRoot}`,
      `hardkas why <artifact> --workspace ${sandboxRoot}`
    ]);

    console.log(pc.red(pc.bold("WARNING:")));
    console.log(pc.red("Sandbox will be destroyed on exit.\n"));

    if (options.recipe) {
      console.log(pc.bold(`Recipe:`));
      console.log(`  ${pc.magenta(options.recipe)} executing...\n`);

      const RECIPES: Record<string, (sandboxRoot: string) => Promise<void>> = {
        transfer: runTransferRecipe,
        "projection-rebuild": runProjectionRebuildRecipe,
        "replay-failure": runReplayFailureRecipe
      };

      const recipeFn = RECIPES[options.recipe];
      if (recipeFn) {
        try {
          await recipeFn(sandboxRoot);
        } catch (err: any) {
          console.error(pc.red(`Recipe execution failed: ${err.message}`));
        }
      } else {
        console.log(pc.red(`Recipe '${options.recipe}' not found.`));
      }
    }

    // Cleanup Coordinator
    let isStopping = false;
    const handleTeardown = async (signal: string) => {
      if (isStopping) return;
      isStopping = true;
      console.log(`\nStopping Sandbox (${signal})...`);

      try {
        if (devCtx) {
          if (devCtx.nodeServer && typeof devCtx.nodeServer.close === "function") {
            devCtx.nodeServer.close();
          }
          if (devCtx.stopHardkasWatcher) {
            await devCtx.stopHardkasWatcher();
          }
          if (devCtx.store) {
            devCtx.store.disconnect();
          }
        }
      } catch (e) {
        // Ignored during shutdown
      }

      // Check marker before cleanup
      try {
        if (fs.existsSync(path.join(sandboxRoot, ".hardkas-sandbox-target"))) {
          console.log(`Cleaning up ephemeral workspace: ${sandboxRoot}`);
          fs.rmSync(sandboxRoot, { recursive: true, force: true });
        } else {
          console.log(pc.yellow(`Marker missing. Skipping cleanup for: ${sandboxRoot}`));
        }
      } catch (e) {
        console.log(pc.red(`\nSandbox cleanup incomplete.`));
        console.log(pc.red(`Remaining workspace:\n${sandboxRoot}`));
        console.log(pc.red(`You may remove it manually.`));
      }

      process.exit(0);
    };

    process.on("SIGINT", () => handleTeardown("SIGINT"));
    process.on("SIGTERM", () => handleTeardown("SIGTERM"));
  } catch (e) {
    handleError(e, "Sandbox initialization failed");
    process.exit(1);
  }
}
