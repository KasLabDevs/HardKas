import { Command } from "commander";
import { UI, handleError } from "../ui.js";
import { runTest } from "../runners/test-runner.js";

export function registerTestCommands(program: Command) {
  program
    .command("test [files...]")
    .description(`Run HardKAS tests against localnet ${UI.maturity("stable")}`)
    .option("--network <network>", "Network to test against", "simnet")
    .option("--watch", "Watch for changes", false)
    .option("--mass-report", "Show mass/fee report after scenario execution", false)
    .option("--mass-snapshot <label>", "Save mass snapshot for regression detection")
    .option("--mass-compare <label>", "Compare against saved mass snapshot")
    .option("--json", "Output results as JSON", false)
    .option("--keep-runs", "Keep temporary scenario workspaces for debugging", false)
    .option("--evidence", "Automatically package evidence into .hke.json", false)
    .option("--scenario <name>", "Run specific scenario by name")
    .action(
      async (
        files: string[],
        options: {
          network: string;
          watch: boolean;
          json: boolean;
          reporter: string;
          massReport: boolean;
          massSnapshot?: string;
          massCompare?: string;
          keepRuns: boolean;
          evidence: boolean;
          scenario?: string;
        }
      ) => {
        try {
          await runTest({
            files,
            workspaceRoot: process.cwd(),
            network: options.network,
            watch: options.watch,
            json: options.json,
            reporter: options.reporter,
            massReport: options.massReport,
            keepRuns: options.keepRuns,
            evidence: options.evidence,
            ...(options.scenario ? { scenario: options.scenario } : {}),
            ...(options.massSnapshot ? { massSnapshot: options.massSnapshot } : {}),
            ...(options.massCompare ? { massCompare: options.massCompare } : {})
          });
        } catch (e) {
          handleError(e, "Test execution failed");
          throw new Error("Command failed");
        }
      }
    );
}
