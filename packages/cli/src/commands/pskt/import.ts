import { Command } from "commander";
import { UI } from "../../ui.js";

export function registerImportCommand(pskt: Command) {
  pskt
    .command("import")
    .description(`Import a raw payload into a PSKT session ${UI.maturity("alpha")}`)
    .requiredOption("--file <sessionPath>", "Path to the PSKT session JSON")
    .requiredOption("--payload <payloadPath>", "Path to the raw payload file")
    .requiredOption("--out <outputPath>", "Path to write the updated PSKT session JSON")
    .option("--force", "Overwrite the output file if it exists", false)
    .option("--json", "Output results as JSON", false)
    .action(async (options: any) => {
      const { runPsktImport } = await import("../../runners/pskt/mutating.js");
      await runPsktImport(options);
    });
}
