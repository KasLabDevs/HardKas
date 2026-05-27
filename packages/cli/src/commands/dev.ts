import { Command } from "commander";
import { UI, handleError } from "../ui.js";

export function registerDevCommands(program: Command) {
  const devCmd = program
    .command("dev")
    .description("Local development and Igra-native environment tools")
    .option("--once", "Initialize dev environment, run health checks, and exit (headless)", false)
    .option("--headless", "Run headlessly (no UI open)", false)
    .option("--json", "Output status as JSON", false)
    .action(async (options: any) => {
      try {
        const { runDevEnv } = await import("../runners/dev-env-runner.js");
        await runDevEnv(options);
      } catch (e) {
        handleError(e, "Dev environment bootstrap failed");
        process.exitCode = 1;
      }
    });

  devCmd
    .command("create <name>")
    .description(`Create a new dApp project from a template ${UI.maturity("stable")}`)
    .action(async (name: string) => {
      try {
        const { runDevCreate } = await import("../runners/dev-create-runner.js");
        await runDevCreate(name);
      } catch (e) {
        handleError(e, "Dev create failed");
        process.exitCode = 1;
      }
    });

  devCmd
    .command("init")
    .description(`Initialize dApp support in the current workspace ${UI.maturity("stable")}`)
    .action(async () => {
      try {
        const { runDevInit } = await import("../runners/dev-init-runner.js");
        await runDevInit();
      } catch (e) {
        handleError(e, "Dev init failed");
        process.exitCode = 1;
      }
    });

  devCmd
    .command("doctor")
    .description(`Validate local dev environment readiness ${UI.maturity("stable")}`)
    .option("--profile <name>", "L2 network profile name", "igra")
    .option("--rpc-url <url>", "Explicit Igra RPC URL to check")
    .option("--account <name>", "Local EVM account name to verify balance")
    .option("--timeout <ms>", "RPC timeout in milliseconds", "3000")
    .option("--json", "Output as JSON", false)
    .action(async (options: any) => {
      try {
        const { runDevDoctor } = await import("../runners/dev-doctor-runner.js");
        await runDevDoctor(options);
      } catch (e) {
        handleError(e, "Dev doctor failed");
        process.exitCode = 1;
      }
    });

  devCmd
    .command("server")
    .description(`Start the local HardKas Dev Server ${UI.maturity("stable")}`)
    .option("--port <number>", "Port to bind to", "7420")
    .option("--host <string>", "Host to bind to", "localhost")
    .option("--open", "Open dashboard in browser automatically", false)
    .option("--unsafe-external", "Allow external access (binds to 0.0.0.0 if host not specified)", false)
    .option("--show-token", "Show the generated API session token for manual script integration", false)
    .option("--json", "Output status as JSON", false)
    .action(async (options: any) => {
      try {
        const { runDevServer } = await import("../runners/dev-server-runner.js");
        await runDevServer(options);
      } catch (e) {
        handleError(e, "Dev server failed");
        process.exitCode = 1;
      }
    });
}
