import { Command } from "commander";
import { UI, handleError } from "../ui.js";

export function registerReplayCommands(program: Command) {
  const replayCmd = program.command("replay").description("Manage HardKAS transaction replays");

  replayCmd.command("verify [path]")
    .description(`Verify replay invariants for a directory of artifacts ${UI.maturity("stable")}`)
    .option("--json", "Output as JSON", false)
    .action(async (path: string | undefined, options: { json: boolean }) => {
      if (!path) path = ".";
      try {
        const { runReplayVerify } = await import("../runners/replay-verify-runner.js");
        await runReplayVerify({ path, ...options });
      } catch (e: any) {
        handleError(e);
        process.exitCode = 1;
      }
    });
}
