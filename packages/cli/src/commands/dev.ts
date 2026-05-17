import { Command } from "commander";
import { UI } from "../ui.js";

export function registerDevCommands(program: Command) {
  const devCmd = program
    .command("dev")
    .description("Local development and Igra-native environment tools");

  devCmd
    .command("doctor")
    .description(`Validate local dev environment readiness ${UI.maturity("stable")}`)
    .option("--profile <name>", "L2 network profile name", "igra")
    .option("--rpc-url <url>", "Explicit Igra RPC URL to check")
    .option("--account <name>", "Local EVM account name to verify balance")
    .option("--timeout <ms>", "RPC timeout in milliseconds", "3000")
    .option("--json", "Output as JSON", false)
    .action(async (options: any) => {
      const { runDevDoctor } = await import("../runners/dev-doctor-runner.js");
      await runDevDoctor(options);
    });

  devCmd
    .command("server")
    .description(`Start the local HardKas Dev Server ${UI.maturity("stable")}`)
    .option("--port <number>", "Port to bind to", "7420")
    .option("--host <string>", "Host to bind to", "localhost")
    .option("--open", "Open dashboard in browser automatically", false)
    .option("--unsafe-external", "Allow external access (binds to 0.0.0.0 if host not specified)", false)
    .option("--json", "Output status as JSON", false)
    .action(async (options: any) => {
      const { runDevServer } = await import("../runners/dev-server-runner.js");
      await runDevServer(options);
    });
}
