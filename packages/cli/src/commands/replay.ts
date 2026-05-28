import { Command } from "commander";
import { UI, handleError } from "../ui.js";
import path from "node:path";

export function registerReplayCommands(program: Command) {
  const replayCmd = program.command("replay").description("Manage HardKAS transaction replays");

  replayCmd.command("verify [path]")
    .description(`Verify replay invariants for a directory of artifacts ${UI.maturity("stable")}`)
    .option("--json", "Output as JSON", false)
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (path: string | undefined, options: any) => {
      if (!path) path = ".";
      try {
        const { runReplayVerify } = await import("../runners/replay-verify-runner.js");
        const workspaceRoot = options.workspace ? path.resolve(options.workspace) : process.cwd();
        await runReplayVerify({ path, ...options, workspaceRoot });
      } catch (e: any) {
        handleError(e);
        process.exitCode = 1;
      }
    });
  replayCmd.command("diff <idA> <idB>")
    .description(`Compare two replay artifacts for deterministic divergence ${UI.maturity("alpha")}`)
    .option("--json", "Output as JSON", false)
    .action(async (idA: string, idB: string, options: { json: boolean }) => {
      try {
        const { runReplayDiff } = await import("../runners/replay-diff-runner.js");
        await runReplayDiff({ idA, idB, ...options, network: "simnet", workspaceRoot: process.cwd() });
      } catch (e: any) {
        handleError(e);
        process.exitCode = 1;
      }
    });
}
