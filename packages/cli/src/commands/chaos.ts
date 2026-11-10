import { Command } from "commander";
import { UI, handleError } from "../ui.js";

// Chaos Exit Codes
export const ChaosExitCodes = {
  NO_FINDINGS: 0,
  FINDINGS_RECOVERABLE: 1,
  INVARIANT_VIOLATION: 2,
  UNSAFE_CONFIG_REFUSED: 3,
  INTERNAL_FAILURE: 4
};

export function registerChaosCommands(program: Command) {
  const chaosCmd = program
    .command("chaos")
    .description(
      `Run the internal Chaos Engine to stress-test the runtime ${UI.maturity("experimental")}`
    )
    .option("--runs <number>", "Number of chaos iterations to run", "300")
    .option("--seed <number>", "Deterministic PRNG seed", "1337")
    .option("--profile <smoke|targeted|full>", "No effect: smoke, targeted and full use the same actor weights", "smoke")
    .option(
      "--actor <LockHell|RotBot|DriftHunter|HumanChaos>",
      "Target a specific chaos actor instead of using a profile"
    )
    .option(
      "--isolate",
      "Always on: every campaign runs in its own new temporary directory, never in the current one (the flag has no effect)",
      true
    )
    .option(
      "--unsafe-current-dir",
      "No effect: a campaign never runs in the current directory; it runs in its own new temporary directory",
      false
    )
    .option("--force-ci-chaos", "No effect: there is no current-directory run to allow in CI", false)
    .option("--force-chaos-destructive", "No effect: there is no current-directory run whose guards could be bypassed", false)
    .action(async (options) => {
      try {
        // ESCALÓN 3 · P20: the campaign used to delete ./.hardkas-chaos and ./.hardkas-chaos-workspace in the current
        // directory without asking. It now runs in a directory it creates under the OS temp dir and deletes only its
        // own workspace there. The current-directory mode never ran (the campaign stayed isolated; only its safety
        // checks did), so its flags have no effect and are named as such (no-effect-options.ts).
        const { runChaosEngine } = await import("../runners/chaos-runner.js");
        await runChaosEngine(options);
      } catch (err: unknown) {
        if ((err as any).exitCode !== undefined) {
          if ((err as any).exitCode !== ChaosExitCodes.NO_FINDINGS) {
            const { HardkasCliError } = await import("../cli-errors.js");
            throw new HardkasCliError("CHAOS_FAILED", ((err instanceof Error) ? err.message : String(err)), { exitCode: (err as any).exitCode });
          }
          process.exit((err as any).exitCode);
        }
        throw err;
      }
    });

  chaosCmd
    .command("replay")
    .description("Re-run one chaos run seed in a fresh temporary directory of its own (the actor is derived from the seed, so runs from an --actor campaign are not reproduced)")
    .requiredOption("--run-seed <number>", "The run seed to replay")
    .option("--isolate", "Always on (the flag has no effect)", true)
    .action(async (options) => {
      try {
        const { replayChaosRun } = await import("../runners/chaos-runner.js");
        await replayChaosRun(options);
      } catch (err: unknown) {
        if ((err as any).exitCode !== undefined) throw err;
        // CLI-RUNTIME-CONTRACT-1: rendered once here, rethrown as itself (code and context kept).
        handleError(err);
        throw err;
      }
    });
}
