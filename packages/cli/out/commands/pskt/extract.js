import { UI } from "../../ui.js";
export function registerExtractCommand(pskt) {
    pskt
        .command("extract <sessionPath>")
        .description(`Extract KaspaRpcTransaction from a finalized PSKT session ${UI.maturity("alpha")}`)
        .requiredOption("--out <outputPath>", "Path to write the Kaspa transaction JSON")
        .option("--force", "Overwrite the output file if it exists", false)
        .option("--json", "Output results as JSON", false)
        .action(async (sessionPath, options) => {
        const { runPsktExtract } = await import("../../runners/pskt/mutating.js");
        await runPsktExtract(sessionPath, options);
    });
}
//# sourceMappingURL=extract.js.map