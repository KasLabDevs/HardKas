import { UI } from "../../ui.js";
export function registerVerifyCommand(pskt) {
    pskt
        .command("verify <sessionPath>")
        .description(`Verify integrity and lineage of a PSKT session ${UI.maturity("alpha")}`)
        .option("--json", "Output results as JSON", false)
        .action(async (sessionPath, options) => {
        const { runPsktVerify } = await import("../../runners/pskt/verify.js");
        await runPsktVerify(sessionPath, options);
    });
}
//# sourceMappingURL=verify.js.map