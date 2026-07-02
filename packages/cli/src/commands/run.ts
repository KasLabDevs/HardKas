// SAFETY_LEVEL: SIMULATION_ONLY

import { Command } from "commander";
import { UI } from "../ui.js";
import { runScript } from "../runners/script-runner.js";

export function registerRunCommand(program: Command): void {
  program
    .command("run <script>")
    .description(
      `Execute a TypeScript or JavaScript file with HardKAS SDK injected ${UI.maturity("stable")}`
    )
    .option("--network <name>", "Network name", "simnet")
    .option("--accounts <n>", "Number of simulated accounts", "3")
    .option("--balance <sompi>", "Initial balance per account in sompi", "100000000000")
    .option("--no-harness", "Skip automatic harness creation")
    .option("--json", "Output results as JSON", false)
    .action(async (script: string, opts: any) => {
      try {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        try {
          const envContent = await fs.readFile(path.join(process.cwd(), ".env"), "utf8");
          envContent.split("\n").forEach(line => {
            const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
            if (match && match[1] && !process.env[match[1]]) {
               process.env[match[1]] = match[2] || "";
            }
          });
        } catch (e) {
          // ignore if .env doesn't exist
        }

        const { logger } = await import("@hardkas/observability");
        logger.info(`Running script: ${script}`, { script, network: opts.network });

        await runScript(script, { ...opts, workspaceRoot: process.cwd() });
        if (opts.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "run", mode: "cli", result: { script } });
        }
      } catch (e) {
        const { handleError } = await import("../ui.js");
        handleError(e, "Run failed");
        process.exit(1);
      }
    });
}
