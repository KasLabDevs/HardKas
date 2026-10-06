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
  // SURFACE-TRUTH-1A (ST-I3): `--with-node` is refused before anything is created. It used to spawn a detached
  // `pnpm hardkas node start --miningaddr …` (an option `node start` does not have), discard its output, and print
  // "Node: running" / "Mining: enabled" without checking anything.
  if (options.withNode) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "SANDBOX_WITH_NODE_UNSUPPORTED",
      "sandbox --with-node is not supported: the sandbox starts no node. Start the Docker localnet with `hardkas localnet start`.",
      { exitCode: 1 }
    );
  }

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
      preventTeardown: true
    } as any);

    // Main Sandbox Banner (SURFACE-TRUTH-1A: only what this run did; no hard-coded network, node, mining or health)
    console.log(pc.bold("\nHardKAS Sandbox Runtime"));
    console.log(pc.dim("━━━━━━━━━━━━━━━━━━━━━━━\n"));

    console.log(pc.bold("Workspace:"));
    console.log(`  ${sandboxRoot}\n`);

    console.log(pc.bold("Mode:"));
    console.log(`  ephemeral\n`);

    console.log(pc.bold("Dashboard:"));
    console.log(`  http://${host}:${port}\n`);

    console.log(pc.bold("Artifacts:"));
    console.log(`  ephemeral\n`);

    console.log(pc.bold("Projection:"));
    console.log(`  rebuilt from the sandbox artifacts\n`);

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
        } catch (err: unknown) {
          console.error(pc.red(`Recipe execution failed: ${((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err))}`));
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
      process.removeAllListeners("SIGINT");
      process.removeAllListeners("SIGTERM");
      process.kill(process.pid, signal);
    };

    process.on("SIGINT", () => handleTeardown("SIGINT"));
    process.on("SIGTERM", () => handleTeardown("SIGTERM"));

    // SURFACE-TRUTH-1A: the sandbox lives until it is interrupted, as the dashboard it announced and "destroyed on
    // exit" say. Returning here let the CLI exit at once: the dashboard stopped answering and nothing was cleaned up.
    await new Promise(() => {});
  } catch (e: unknown) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "SANDBOX_FAILED",
      `Sandbox initialization failed: ${((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))}`,
      { exitCode: 1, cause: e }
    );
  }
}
