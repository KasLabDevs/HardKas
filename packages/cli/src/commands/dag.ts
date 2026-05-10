import { Command } from "commander";
import { handleError } from "../ui.js";

export function registerDagCommands(program: Command) {
  const dagCmd = program.command("dag").description("Simulate blockDAG operations (Localnet only)");

  dagCmd.command("status")
    .description("View current DAG status")
    .action(async () => {
      try {
        const { runDagStatus } = await import("../runners/dag-runners.js");
        await runDagStatus();
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  dagCmd.command("simulate-reorg")
    .description("Simulate a DAG reorg")
    .option("--depth <n>", "Reorg depth", "1")
    .action(async (options: { depth: string }) => {
      try {
        const { runDagSimulateReorg } = await import("../runners/dag-runners.js");
        await runDagSimulateReorg({ depth: parseInt(options.depth) });
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });
}
