import path from "node:path";
import fs from "node:fs/promises";
import { UI, handleError } from "../ui.js";
// Chaos Exit Codes
export const ChaosExitCodes = {
    NO_FINDINGS: 0,
    FINDINGS_RECOVERABLE: 1,
    INVARIANT_VIOLATION: 2,
    UNSAFE_CONFIG_REFUSED: 3,
    INTERNAL_FAILURE: 4
};
export function registerChaosCommands(program) {
    const chaosCmd = program
        .command("chaos")
        .description(`Run the internal Chaos Engine to stress-test the runtime ${UI.maturity("experimental")}`)
        .option("--runs <number>", "Number of chaos iterations to run", "300")
        .option("--seed <number>", "Deterministic PRNG seed", "1337")
        .option("--profile <smoke|targeted|full>", "Fuzzing distribution profile", "smoke")
        .option("--actor <LockHell|RotBot|DriftHunter|HumanChaos>", "Target a specific chaos actor instead of using a profile")
        .option("--isolate", "Run the chaos engine in a dedicated temporary workspace (Default)", true)
        .option("--unsafe-current-dir", "Run chaos in the current directory (DANGEROUS)", false)
        .option("--force-ci-chaos", "Allow unsafe chaos in CI environments", false)
        .option("--force-chaos-destructive", "Bypass workspace protection guards", false)
        .action(async (options) => {
        try {
            await enforceSafetyGuards(options);
            const { runChaosEngine } = await import("../runners/chaos-runner.js");
            await runChaosEngine(options);
        }
        catch (err) {
            if (err.exitCode !== undefined) {
                if (err.exitCode !== ChaosExitCodes.NO_FINDINGS) {
                    UI.error(err.message);
                }
                process.exit(err.exitCode);
            }
            handleError(err);
            process.exit(ChaosExitCodes.INTERNAL_FAILURE);
        }
    });
    chaosCmd
        .command("replay")
        .description("Replay a specific chaos run deterministically")
        .requiredOption("--run-seed <number>", "The run seed to replay")
        .option("--isolate", "Run in isolated workspace", true)
        .action(async (options) => {
        try {
            const { replayChaosRun } = await import("../runners/chaos-runner.js");
            await replayChaosRun(options);
        }
        catch (err) {
            if (err.exitCode !== undefined)
                process.exit(err.exitCode);
            handleError(err);
            process.exit(ChaosExitCodes.INTERNAL_FAILURE);
        }
    });
}
async function enforceSafetyGuards(options) {
    // If not explicitly asking for unsafe, force isolate
    if (!options.unsafeCurrentDir) {
        options.isolate = true;
        return;
    }
    // Unsafe mode requested
    if (process.env.HARDKAS_ALLOW_UNSAFE_CHAOS !== "1") {
        throw {
            message: "Unsafe chaos mode requires HARDKAS_ALLOW_UNSAFE_CHAOS=1 in environment.",
            exitCode: ChaosExitCodes.UNSAFE_CONFIG_REFUSED
        };
    }
    if (process.env.CI && !options.forceCiChaos) {
        throw {
            message: "Unsafe chaos is disabled in CI. Use --force-ci-chaos to override.",
            exitCode: ChaosExitCodes.UNSAFE_CONFIG_REFUSED
        };
    }
    if (!options.forceChaosDestructive) {
        const cwd = process.cwd();
        const hardkasDir = path.join(cwd, ".hardkas");
        const guards = [
            path.join(cwd, ".git"),
            path.join(cwd, ".env"),
            path.join(hardkasDir, "keystore"),
            path.join(hardkasDir, "artifacts")
        ];
        for (const p of guards) {
            try {
                const stats = await fs.stat(p);
                if (stats) {
                    throw {
                        message: `Unsafe chaos refused: Found protected resource at '${p}'.\nUse --force-chaos-destructive if you absolutely know what you are doing.`,
                        exitCode: ChaosExitCodes.UNSAFE_CONFIG_REFUSED
                    };
                }
            }
            catch (e) {
                if (e.exitCode)
                    throw e; // bubble up
                // File doesn't exist, which is good
            }
        }
        // Prompt confirmation
        const sure = await UI.confirm("You are about to unleash chaos on your current directory. It may destroy data. Proceed?");
        if (!sure) {
            throw { message: "Chaos aborted.", exitCode: ChaosExitCodes.UNSAFE_CONFIG_REFUSED };
        }
    }
}
//# sourceMappingURL=chaos.js.map