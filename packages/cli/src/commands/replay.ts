import { Command } from "commander";
import { UI } from "../ui.js";
import path from "node:path";

export function registerReplayCommands(program: Command) {
  const replayCmd = program
    .command("replay")
    .description("Manage HardKAS transaction replays");

  replayCmd
    .command("verify [artifact]")
    .description(
      `Verify deterministic simulator-mode replay for a receipt by exact artifactId or artifact file path. Real-node (kaspa consensus) receipts are not currently supported and will report REPLAY_MODE_UNSUPPORTED. ${UI.maturity("stable")}`
    )
    .option("--json", "Output as JSON", false)
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (targetPath: string | undefined, options: any) => {
      try {
        const { runReplayVerify } = await import("../runners/replay-verify-runner.js");
        const workspaceRoot = options.workspace
          ? path.resolve(options.workspace)
          : process.cwd();
        await runReplayVerify({ path: targetPath || "", ...options, workspaceRoot });
      } catch (e: unknown) {
        throw new Error("Command failed");
      }
    });
  replayCmd
    .command("diff <idA> <idB>")
    .description(
      `Compare two replay artifacts for deterministic divergence ${UI.maturity("alpha")}`
    )
    .option("--json", "Output as JSON", false)
    .action(async (idA: string, idB: string, options: { json: boolean }) => {
      try {
        const { runReplayDiff } = await import("../runners/replay-diff-runner.js");
        await runReplayDiff({
          idA,
          idB,
          ...options,
          network: "simnet",
          workspaceRoot: process.cwd()
        });
      } catch (e: unknown) {
        throw new Error("Command failed");
      }
    });
}
