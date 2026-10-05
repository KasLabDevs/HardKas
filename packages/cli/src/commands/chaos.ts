import { Command } from "commander";
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

export function registerChaosCommands(program: Command) {
  const chaosCmd = program
    .command("chaos")
    .description(
      `Run the internal Chaos Engine to stress-test the runtime ${UI.maturity("experimental")}`
    )
    .option("--runs <number>", "Number of chaos iterations to run", "300")
    .option("--seed <number>", "Deterministic PRNG seed", "1337")
    .option("--profile <smoke|targeted|full>", "Actor weight profile (smoke, targeted and full currently use the same weights)", "smoke")
    .option(
      "--actor <LockHell|RotBot|DriftHunter|HumanChaos>",
      "Target a specific chaos actor instead of using a profile"
    )
    .option(
      "--isolate",
      "Always on: chaos runs in ./.hardkas-chaos-workspace (the flag has no effect)",
      true
    )
    .option(
      "--unsafe-current-dir",
      "Request a run in the current directory (DANGEROUS; needs HARDKAS_ALLOW_UNSAFE_CHAOS=1). Known issue: only the safety checks run, the campaign stays in the isolated workspace",
      false
    )
    .option("--force-ci-chaos", "Allow unsafe chaos in CI environments", false)
    .option("--force-chaos-destructive", "Bypass workspace protection guards", false)
    .action(async (options) => {
      try {
        await enforceSafetyGuards(options);
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
    .description("Re-run one chaos run seed in a fresh isolated workspace (the actor is derived from the seed, so runs from an --actor campaign are not reproduced)")
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

async function enforceSafetyGuards(options: any) {
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
      } catch (e: unknown) {
        // bubble the refusal up as itself, so its exit code (UNSAFE_CONFIG_REFUSED) survives
        if ((e as any).exitCode) throw e;
        // File doesn't exist, which is good
      }
    }

    // Prompt confirmation
    const sure = await UI.confirm(
      "You are about to unleash chaos on your current directory. It may destroy data. Proceed?"
    );
    if (!sure) {
      throw { message: "Chaos aborted.", exitCode: ChaosExitCodes.UNSAFE_CONFIG_REFUSED };
    }
  }
}
