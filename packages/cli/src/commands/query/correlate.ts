import { Command } from "commander";
import { handleError } from "../../ui.js";
import { printCorrelationBundle } from "./ui-helpers.js";

export function registerCorrelateQueryCommands(queryCmd: Command) {
  queryCmd
    .command("correlate <txId>")
    .description("Full cross-domain timeline (lineage, dag, rpc, replay)")
    .option("--include <domains...>", "Domains to include", ["lineage", "dag", "rpc", "replay"])
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief|full)")
    .action(async (txId, options) => {
      try {
        const { UI } = await import("../../ui.js");
        UI.error("Correlation queries are temporarily disabled while the query API stabilizes.");
        process.exitCode = 1;
      } catch (e) { handleError(e); process.exitCode = 1; }
    });
}
