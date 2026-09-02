import { UI } from "../../ui.js";
export function registerFinalizeCommand(pskt) {
    pskt
        .command("finalize <sessionPath>")
        .description(`Finalize a PSKT session ${UI.maturity("alpha")}`)
        .requiredOption("--out <outputPath>", "Path to write the finalized PSKT session JSON")
        .option("--force", "Overwrite the output file if it exists", false)
        .option("--json", "Output results as JSON", false)
        .action(async (sessionPath, options) => {
        const { runPsktFinalize } = await import("../../runners/pskt/mutating.js");
        await runPsktFinalize(sessionPath, options);
    });
}
//# sourceMappingURL=finalize.js.map