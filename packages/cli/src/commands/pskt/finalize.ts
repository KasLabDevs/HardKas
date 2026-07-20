import { Command } from "commander";
import { UI } from "../../ui.js";

export function registerFinalizeCommand(pskt: Command) {
  pskt
    .command("finalize <sessionPath>")
    .description(`Finalize a PSKT session ${UI.maturity("alpha")}`)
    .requiredOption("--out <outputPath>", "Path to write the finalized PSKT session JSON")
    .option("--force", "Overwrite the output file if it exists", false)
    .option("--json", "Output results as JSON", false)
    .action(async (sessionPath: string, options: any) => {
      const { runPsktFinalize } = await import("../../runners/pskt/mutating.js");
      await runPsktFinalize(sessionPath, options);
    });
}
