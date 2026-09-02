import { UI } from "../../ui.js";
export function registerMergeCommand(pskt) {
    pskt
        .command("merge <sessionA> <sessionB>")
        .description(`Merge two PSKT sessions ${UI.maturity("alpha")}`)
        .requiredOption("--out <outputPath>", "Path to write the merged PSKT session JSON")
        .option("--force", "Overwrite the output file if it exists", false)
        .option("--json", "Output results as JSON", false)
        .action(async (sessionA, sessionB, options) => {
        const { runPsktMerge } = await import("../../runners/pskt/mutating.js");
        await runPsktMerge(sessionA, sessionB, options);
    });
}
//# sourceMappingURL=merge.js.map