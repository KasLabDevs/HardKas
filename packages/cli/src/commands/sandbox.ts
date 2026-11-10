import { Command } from "commander";
import { runSandbox } from "../runners/sandbox-runner.js";

export function registerSandboxCommand(program: Command) {
  program
    .command("sandbox")
    .description("Start a temporary, ephemeral HardKAS local experimentation environment")
    .option("--with-node", "Not supported: the sandbox starts no node (refuses with SANDBOX_WITH_NODE_UNSUPPORTED)")
    .option("--recipe <name>", "Run an initial recipe/template inside the sandbox")
    .option("-p, --port <port>", "Port for dev-server API", "3000")
    // ESCALÓN 2 · P17: the host's short flag is -H; -h is the help again (it was the host, so `-h` asked for a value)
    .option("-H, --host <host>", "Host for dev-server API", "localhost")
    .action(async (options) => {
      await runSandbox(options);
    });
}
