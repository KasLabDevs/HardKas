import { Command } from "commander";
import { UI } from "../../ui.js";

export function registerMergeCommand(pskt: Command) {
  pskt
    .command("merge <sessionA> <sessionB>")
    .description(`Merge two PSKT sessions ${UI.maturity("alpha")}`)
    .requiredOption("--out <outputPath>", "Path to write the merged PSKT session JSON")
    .option("--force", "Overwrite the output file if it exists", false)
    .option("--json", "Output results as JSON", false)
    .action(async (sessionA: string, sessionB: string, options: any) => {
      const { runPsktMerge } = await import("../../runners/pskt/mutating.js");
      await runPsktMerge(sessionA, sessionB, options);
    });
}
