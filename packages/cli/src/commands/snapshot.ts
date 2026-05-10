import { Command } from "commander";

export function registerSnapshotCommands(program: Command) {
  const snapshotCmd = program.command("snapshot").description("Manage HardKAS localnet snapshots");

  snapshotCmd.command("verify <idOrName>")
    .description("Verify the integrity of a snapshot")
    .action(async (idOrName: string) => {
      const { runSnapshotVerify } = await import("../runners/snapshot-verify-runner.js");
      await runSnapshotVerify({ idOrName });
    });

  snapshotCmd.command("restore <idOrName>")
    .description("Restore localnet state from a snapshot")
    .action(async (idOrName: string) => {
      const { runSnapshotRestore } = await import("../runners/snapshot-restore-runner.js");
      await runSnapshotRestore({ idOrName });
    });
}
