import { Command } from "commander";
import { UI, handleError } from "../ui.js";
import { runTest } from "../runners/test-runner.js";

export function registerTestCommands(program: Command) {
  program
    .command("test [files...]")
    .description(`Run the project's tests with Vitest and the HardKAS test helpers ${UI.maturity("stable")}`)
    .option("--network <network>", "Only recorded in the results: tests use the config's default network", "simnet")
    .option("--watch", "Passed to Vitest, but the CLI exits after the first run (watch does not persist)", false)
    .option("--mass-report", "No effect in this release", false)
    .option("--mass-snapshot <label>", "No effect in this release")
    .option("--mass-compare <label>", "No effect in this release")
    .option("--json", "Output results as JSON", false)
    .option("--keep-runs", "Keep temporary scenario workspaces for debugging", false)
    .option("--evidence", "Automatically package evidence into .hke.json", false)
    .option("--scenario <name>", "Only run tests whose full name matches this regular expression")
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
          // CLI-RUNTIME-CONTRACT-1: rendered once here, rethrown as itself (code and context kept).
          handleError(e, "Test execution failed");
          throw e;
        }
      }
    );
}
