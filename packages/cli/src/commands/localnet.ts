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
    .option("--at-daa-score <score>", "Fork at specific DAA score (default: latest)")
    .option("--output <path>", "Save fork snapshot to file")
    .option("--json", "Output as JSON", false)
    .action(async (opts) => {
      await runLocalnetFork({
        network: opts.network,
        addresses: opts.addresses || [],
        atDaaScore: opts.atDaaScore,
        outputPath: opts.output
      });
    });
}
