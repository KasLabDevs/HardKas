import { Command } from "commander";

export function registerDagCommands(program: Command) {
  const dagCmd = program
    .command("dag")
    .description("Simulate blockDAG operations (Localnet only)");

  dagCmd
    .command("status")
    .description("View current DAG status")
    .action(async () => {
      try {
        const { runDagStatus } = await import("../runners/dag-runners.js");
        await runDagStatus();
      } catch (e) {
        throw e;
      }
    });

  dagCmd
    .command("simulate-reorg")
    .description("Simulate a DAG reorg")
    .option("--depth <n>", "Reorg depth: a whole number of blocks, 0 or more", "1")
    .action(async (options: { depth: string }) => {
      try {
        // ESCALÓN 2 · P19: a depth that is not a whole number was used as NaN ("depth NaN") and the reorg still ran
        if (!/^\d+$/.test(String(options.depth))) {
          const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
          throw new HardkasCliError("DAG_DEPTH_INVALID", `--depth '${options.depth}' is not a whole number of blocks. Nothing was changed.`, {
            exitCode: HardkasExitCode.USAGE_ERROR
          });
        }
        const { runDagSimulateReorg } = await import("../runners/dag-runners.js");
        await runDagSimulateReorg({ depth: parseInt(options.depth) });
      } catch (e) {
        throw e;
      }
    });
}
