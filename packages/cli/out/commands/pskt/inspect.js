import { UI } from "../../ui.js";
export function registerInspectCommand(pskt) {
    pskt
        .command("inspect <sessionPath>")
        .description(`Inspect a PSKT session payload and metadata ${UI.maturity("alpha")}`)
        .option("--json", "Output results as JSON", false)
        .action(async (sessionPath, options) => {
        const { runPsktInspect } = await import("../../runners/pskt/inspect.js");
        await runPsktInspect(sessionPath, options);
    });
}
//# sourceMappingURL=inspect.js.map