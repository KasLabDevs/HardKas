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

  snapshotCmd.command("create <name>")
    .description(`Create a deterministic snapshot of current localnet state ${UI.maturity("alpha")}`)
    .option("--consensus-validated", "Mark snapshot as validated by consensus (strict)", false)
    .option("--json", "Output as JSON", false)
    .action(async (name: string, options: { consensusValidated: boolean; json: boolean }) => {
      const { runSnapshotCreate } = await import("../runners/snapshot-create-runner.js");
      await runSnapshotCreate({ name, ...options });
    });

  snapshotCmd.command("replay <name>")
    .description(`Replay and rebuild deterministic state from a snapshot ${UI.maturity("alpha")}`)
    .option("--json", "Output as JSON", false)
    .action(async (name: string, options: { json: boolean }) => {
      const { runSnapshotReplay } = await import("../runners/snapshot-replay-runner.js");
      await runSnapshotReplay({ name, ...options });
    });
}
