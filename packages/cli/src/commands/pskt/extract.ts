import { Command } from "commander";
import { UI } from "../../ui.js";

export function registerExtractCommand(pskt: Command) {
  pskt
    .command("extract <sessionPath>")
    .description(`Extract KaspaRpcTransaction from a finalized PSKT session ${UI.maturity("alpha")}`)
    .requiredOption("--out <outputPath>", "Path to write the Kaspa transaction JSON")
    .option("--force", "Overwrite the output file if it exists", false)
    .option("--json", "Output results as JSON", false)
    .action(async (sessionPath: string, options: any) => {
      const { runPsktExtract } = await import("../../runners/pskt/mutating.js");
      await runPsktExtract(sessionPath, options);
    });
}
