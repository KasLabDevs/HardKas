import { Command } from "commander";
import { UI } from "../ui.js";

export function registerSnapshotCommands(program: Command) {
  const snapshotCmd = program.command("snapshot").description("Manage HardKAS localnet snapshots");

  snapshotCmd.command("verify <idOrName>")
    .description(`Verify the integrity of a snapshot ${UI.maturity("preview")}`)
    .option("--json", "Output as JSON", false)
    .action(async (idOrName: string, options: { json: boolean }) => {
      const { runSnapshotVerify } = await import("../runners/snapshot-verify-runner.js");
      await runSnapshotVerify({ idOrName, ...options });
    });

  snapshotCmd.command("restore <idOrName>")
    .description(`Restore localnet state from a snapshot ${UI.maturity("preview")}`)
    .option("--json", "Output as JSON", false)
    .action(async (idOrName: string, options: { json: boolean }) => {
      const { runSnapshotRestore } = await import("../runners/snapshot-restore-runner.js");
      await runSnapshotRestore({ idOrName, ...options });
    });
}
