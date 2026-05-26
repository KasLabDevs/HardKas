import { Command } from "commander";
import { UI } from "../ui.js";
import { runLocalnetFork } from "../runners/localnet-runners.js";

export function registerLocalnetCommands(program: Command): void {
  const localnet = program
    .command("localnet")
    .description("Manage localnet state and snapshots");

  localnet
    .command("fork")
    .description(`Fork state from a real Kaspa network for local simulation ${UI.maturity("preview")}`)
    .requiredOption("--network <name>", "Network to fork from")
    .option("--addresses <addrs...>", "Only fetch UTXOs for these addresses")
    .requiredOption("--at-daa-score <score>", "Fork at specific DAA score (implicit latest is forbidden)")
    .option("--output <path>", "Save fork snapshot to file")
    .option("--json", "Output as JSON", false)
    .action(async (opts) => {
      await runLocalnetFork({
        network: opts.network,
        addresses: opts.addresses || [],
        atDaaScore: opts.atDaaScore,
        outputPath: opts.output,
        workspaceRoot: process.cwd()
      });
    });

  const snapshotCmd = localnet.command("snapshot").description("Manage HardKAS localnet snapshots");

  snapshotCmd.command("verify <idOrName>")
    .description(`Verify the integrity of a snapshot ${UI.maturity("preview")}`)
    .option("--json", "Output as JSON", false)
    .action(async (idOrName: string, options: { json: boolean }) => {
      const { runSnapshotVerify } = await import("../runners/snapshot-verify-runner.js");
      await runSnapshotVerify({ idOrName, ...options, workspaceRoot: process.cwd() });
    });

  snapshotCmd.command("create <name>")
    .description(`Create a deterministic snapshot of current localnet state ${UI.maturity("alpha")}`)
    .option("--consensus-validated", "Mark snapshot as validated by consensus (strict)", false)
    .option("--json", "Output as JSON", false)
    .action(async (name: string, options: { consensusValidated: boolean; json: boolean }) => {
      const { runSnapshotCreate } = await import("../runners/snapshot-create-runner.js");
      await runSnapshotCreate({ name, consensusValidated: options.consensusValidated, json: options.json, workspaceRoot: process.cwd() });
    });

  snapshotCmd.command("replay <name>")
    .description(`Replay and rebuild deterministic state from a snapshot ${UI.maturity("alpha")}`)
    .option("--json", "Output as JSON", false)
    .action(async (name: string, options: { json: boolean }) => {
      const { runSnapshotReplay } = await import("../runners/snapshot-replay-runner.js");
      await runSnapshotReplay({ name, json: options.json, workspaceRoot: process.cwd() });
    });
}
