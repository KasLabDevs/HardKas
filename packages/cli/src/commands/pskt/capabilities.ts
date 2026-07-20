import { Command } from "commander";
import { UI } from "../../ui.js";

export function registerCapabilitiesCommand(pskt: Command) {
  pskt
    .command("capabilities")
    .description(`Show PSKT adapter capabilities ${UI.maturity("alpha")}`)
    .option("--adapter <adapterId>", "Specific adapter ID to query (default: kaspa-wasm-local)")
    .option("--json", "Output results as JSON", false)
    .action(async (options: any) => {
      const { runPsktCapabilities } = await import("../../runners/pskt/capabilities.js");
      await runPsktCapabilities(options);
    });
}
