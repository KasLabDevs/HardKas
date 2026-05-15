import { Command } from "commander";
import { UI } from "../ui.js";

export function registerReplayCommands(program: Command) {
  const replayCmd = program.command("replay").description("Manage HardKAS transaction replays");

  replayCmd.command("verify <path>")
    .description(`Verify replay invariants for a directory of artifacts ${UI.maturity("stable")}`)
    .option("--json", "Output as JSON", false)
    .action(async (path: string, options: { json: boolean }) => {
      const { runReplayVerify } = await import("../runners/replay-verify-runner.js");
      await runReplayVerify({ path, ...options });
    });
}
