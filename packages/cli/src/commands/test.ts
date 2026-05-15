import { Command } from "commander";
import { UI, handleError } from "../ui.js";
import { runTest } from "../runners/test-runner.js";

export function registerTestCommands(program: Command) {
  program
    .command("test [files...]")
    .description(`Run HardKAS tests against localnet ${UI.maturity("stable")}`)
    .option("--network <network>", "Network to test against", "simnet")
    .option("--watch", "Watch for changes", false)
    .option("--json", "Output results as JSON", false)
    .option("--mass-report", "Show mass/fee report after test run", false)
    .option("--mass-snapshot <label>", "Save mass snapshot for regression detection")
    .option("--mass-compare <label>", "Compare against saved mass snapshot")
    .action(async (files: string[], options: { 
      network: string; 
      watch: boolean; 
      json: boolean; 
      reporter: string;
      massReport: boolean;
      massSnapshot?: string;
      massCompare?: string;
    }) => {
      try {
        await runTest({
          files,
          network: options.network,
          watch: options.watch,
          json: options.json,
          reporter: options.reporter,
          massReport: options.massReport,
          ...(options.massSnapshot ? { massSnapshot: options.massSnapshot } : {}),
          ...(options.massCompare ? { massCompare: options.massCompare } : {})
        });
      } catch (e) {
        handleError(e, "Test execution failed");
        process.exit(1);
      }
    });
}
