// SAFETY_LEVEL: SIMULATION_ONLY
import { UI, handleError } from "../ui.js";
export function registerTortureCommands(program) {
    const tortureCmd = program
        .command("torture")
        .description("HardKAS Semantic Torture Testing Suite");
    tortureCmd
        .command("matrix")
        .description(`Execute the deterministic chaos-and-mutation torture matrix ${UI.maturity("alpha")}`)
        .option("--iterations <number>", "Number of torture cases to execute", "300")
        .option("--seed <seed>", "Seed value for deterministic inputs or 'random'", "random")
        .option("--report [path]", "Optional custom JSON output filepath for findings report")
        .option("--bucket <name>", "Optional target bucket name to execute exclusively")
        .option("--profile <name>", "Optional profile name to execute")
        .option("--debug-stack", "Print raw stacktraces when cases fail", false)
        .action(async (options) => {
        try {
            const { runTortureMatrix } = await import("../runners/torture-runner.js");
            const parsedIterations = parseInt(options.iterations, 10);
            if (isNaN(parsedIterations)) {
                throw new Error(`Invalid iterations count: ${options.iterations}`);
            }
            await runTortureMatrix({
                iterations: parsedIterations,
                seed: options.seed,
                report: options.report,
                bucket: options.bucket,
                profile: options.profile,
                debugStack: options.debugStack
            });
        }
        catch (err) {
            handleError(err);
            process.exitCode = 1;
        }
    });
    tortureCmd
        .command("replay")
        .description(`Replay and debug a specific failed case from a torture run ${UI.maturity("alpha")}`)
        .requiredOption("--seed <number>", "Original global seed of the failed matrix run")
        .requiredOption("--case <caseId>", "Failed case ID, e.g. case-001")
        .option("--profile <name>", "Original profile filter of the failed matrix run")
        .action(async (options) => {
        try {
            const { runTortureReplay } = await import("../runners/torture-runner.js");
            const parsedSeed = parseInt(options.seed, 10);
            if (isNaN(parsedSeed)) {
                throw new Error(`Invalid seed provided for replay: ${options.seed}`);
            }
            await runTortureReplay({
                seed: parsedSeed,
                caseId: options.case,
                ...(options.profile !== undefined ? { profile: options.profile } : {})
            });
        }
        catch (err) {
            handleError(err);
            process.exitCode = 1;
        }
    });
}
//# sourceMappingURL=torture.js.map