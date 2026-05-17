import { Command } from "commander";
import { UI } from "../ui.js";
import pc from "picocolors";

export function registerDashboardCommand(program: Command) {
  program
    .command("dashboard")
    .description(`Open the HardKas Local Dashboard ${UI.maturity("stable")}`)
    .option("--port <number>", "Port to bind to", "7420")
    .option("--start-server", "Start the dev server if not running", false)
    .action(async (options: any) => {
      try {
        // Check if server is running
        const isRunning = await checkServerRunning(options.port);

        if (!isRunning) {
          if (options.startServer) {
            console.log(pc.cyan("HardKas Dev Server not found. Starting it now..."));
            const { runDevServer } = await import("../runners/dev-server-runner.js");
            // runDevServer is blocking, so this will keep the dashboard alive
            await runDevServer({ ...options, open: true, host: "localhost", unsafeExternal: false, json: false });
          } else {
            console.log(pc.red("\nHardKas Dashboard requires the local dev server."));
            console.log(pc.dim("\nRun:"));
            console.log(`  ${pc.bold("hardkas dev server")}`);
            console.log(pc.dim("\nOr:"));
            console.log(`  ${pc.bold("hardkas dashboard --start-server")}\n`);
            process.exit(1);
          }
        } else {
          // Server is already running, just open the browser
          const open = (await import("open")).default;
          console.log(pc.green(`Connecting to existing Dev Server on port ${options.port}...`));
          await open(`http://localhost:${options.port}`);
        }
      } catch (e) {
        console.error(pc.red("Error starting dashboard:"), e);
      }
    });
}

async function checkServerRunning(port: string): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}
