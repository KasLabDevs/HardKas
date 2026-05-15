// SAFETY_LEVEL: SIMULATION_ONLY

import { Command } from "commander";
import { UI } from "../ui.js";
import { runScript } from "../runners/script-runner.js";

export function registerRunCommand(program: Command): void {
  program
    .command("run <script>")
    .description(`Execute a TypeScript or JavaScript file with HardKAS SDK injected ${UI.maturity("stable")}`)
    .option("--network <name>", "Network name", "simnet")
    .option("--accounts <n>", "Number of simulated accounts", "3")
    .option("--balance <sompi>", "Initial balance per account in sompi", "100000000000")
    .option("--no-harness", "Skip automatic harness creation")
    .action(async (script: string, opts: any) => {
      await runScript(script, opts);
    });
}
