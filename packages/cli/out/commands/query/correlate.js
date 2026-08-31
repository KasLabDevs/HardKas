export function registerCorrelateQueryCommands(queryCmd) {
    queryCmd
        .command("correlate <txId>")
        .description("Full cross-domain timeline (lineage, dag, rpc, replay)")
        .option("--include <domains...>", "Domains to include", [
        "lineage",
        "dag",
        "rpc",
        "replay"
    ])
        .option("--json", "Output as JSON", false)
        .option("--explain [level]", "Attach explain chains (brief|full)")
        .action(async (txId, options) => {
        try {
            const { UI } = await import("../../ui.js");
            UI.error("Correlation queries are temporarily disabled while the query API stabilizes.");
            const { HardkasCliError } = await import("../../cli-errors.js");
            throw new HardkasCliError("COMMAND_FAILED", "Correlation disabled", {
                exitCode: 1
            });
        }
        catch (e) {
            throw e;
        }
    });
}
//# sourceMappingURL=correlate.js.map