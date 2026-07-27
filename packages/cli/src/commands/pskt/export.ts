import { Command } from "commander";
import { UI } from "../../ui.js";

export function registerExportCommand(pskt: Command) {
  pskt
    .command("export")
    .description(`Export a TxPlan as a Portable Signing Session ${UI.maturity("alpha")}`)
    .requiredOption("--plan <planPath>", "Path to the TxPlan JSON artifact")
    .requiredOption("--out <sessionPath>", "Path to write the new PSKT session JSON")
    .option("--adapter <adapterId>", "Specific adapter ID to bind to (default: kaspa-wasm-local)")
    .option("--force", "Overwrite the output file if it exists", false)
    .option("--json", "Output results as JSON", false)
    .action(async (options: any) => {
      const { runPsktExport } = await import("../../runners/pskt/mutating.js");
      await runPsktExport(options);
    });
}
