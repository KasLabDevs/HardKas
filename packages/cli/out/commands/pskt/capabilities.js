import { UI } from "../../ui.js";
export function registerCapabilitiesCommand(pskt) {
    pskt
        .command("capabilities")
        .description(`Show PSKT adapter capabilities ${UI.maturity("alpha")}`)
        .option("--adapter <adapterId>", "Specific adapter ID to query (default: kaspa-wasm-local)")
        .option("--json", "Output results as JSON", false)
        .action(async (options) => {
        const { runPsktCapabilities } = await import("../../runners/pskt/capabilities.js");
        await runPsktCapabilities(options);
    });
}
//# sourceMappingURL=capabilities.js.map