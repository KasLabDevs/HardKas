import { runSandbox } from "../runners/sandbox-runner.js";
export function registerSandboxCommand(program) {
    program
        .command("sandbox")
        .description("Start a temporary, ephemeral HardKAS local experimentation environment")
        .option("--with-node", "Start a simulated Kaspa node in the background with mining")
        .option("--recipe <name>", "Run an initial recipe/template inside the sandbox")
        .option("-p, --port <port>", "Port for dashboard", "3000")
        .option("-h, --host <host>", "Host for dashboard", "localhost")
        .action(async (options) => {
        await runSandbox(options);
    });
}
//# sourceMappingURL=sandbox.js.map