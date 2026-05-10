import { Command } from "commander";

export function registerReplayCommands(program: Command) {
  const replayCmd = program.command("replay").description("Manage HardKAS transaction replays");

  replayCmd.command("verify <path>")
    .description("Verify replay invariants for a directory of artifacts")
    .action(async (path: string) => {
      const { runReplayVerify } = await import("../runners/replay-verify-runner.js");
      await runReplayVerify({ path });
    });
}
