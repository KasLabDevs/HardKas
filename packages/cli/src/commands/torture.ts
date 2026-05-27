// SAFETY_LEVEL: SIMULATION_ONLY

import { Command } from "commander";
import { UI, handleError } from "../ui.js";

export function registerTortureCommands(program: Command) {
  const tortureCmd = program.command("torture").description("HardKAS Semantic Torture Testing Suite");

  tortureCmd
    .command("matrix")
    .description(`Execute the deterministic chaos-and-mutation torture matrix ${UI.maturity("alpha")}`)
    .option("--iterations <number>", "Number of torture cases to execute", "300")
    .option("--seed <seed>", "Seed value for deterministic inputs or 'random'", "random")
    .option("--report [path]", "Optional custom JSON output filepath for findings report")
    .option("--bucket <name>", "Optional target bucket name to execute exclusively")
    .option("--profile <name>", "Optional profile name to execute")
    .action(async (options: { iterations: string; seed: string; report?: string; bucket?: string; profile?: string }) => {
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
          profile: options.profile
        });
      } catch (err: any) {
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
    .action(async (options: { seed: string; case: string; profile?: string }) => {
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
      } catch (err: any) {
        handleError(err);
        process.exitCode = 1;
      }
    });
}
