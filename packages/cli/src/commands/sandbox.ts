import { Command } from "commander";
import { runSandbox } from "../runners/sandbox-runner.js";

export function registerSandboxCommand(program: Command) {
  program
    .command("sandbox")
    .description("Start a temporary, ephemeral HardKAS local experimentation environment")
    .option("--with-node", "Not supported: the sandbox starts no node (refuses with SANDBOX_WITH_NODE_UNSUPPORTED)")
    .option("--recipe <name>", "Run an initial recipe/template inside the sandbox")
    .option("-p, --port <port>", "Port for dashboard", "3000")
    .option("-h, --host <host>", "Host for dashboard", "localhost")
    .action(async (options) => {
      await runSandbox(options);
    });
}
