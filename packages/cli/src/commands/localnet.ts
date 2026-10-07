import { Command } from "commander";
import { UI } from "../ui.js";
import {
  runLocalnetFork,
  runLocalnetFund,
  runLocalnetStart,
  runLocalnetStatus,
  runLocalnetStop
} from "../runners/localnet-runners.js";
import { parseKasToSompi } from "@hardkas/core";
import { invocationWorkspaceRoot } from "../workspace-root.js";

export function registerLocalnetCommands(program: Command): void {
  const localnet = program
    .command("localnet")
    .description("Manage localnet state and snapshots");

  localnet
    .command("start")
    .description(`Start (or adopt) the Docker rusty-kaspad node for the toccata-v2 profile and create dev accounts alice…erin; needs Docker ${UI.maturity("alpha")}`)
    .option("--profile <name>", "Localnet profile: toccata-v2 (the only one, required; or use --toccata)")
    .option("--toccata", "Shortcut for --profile toccata-v2", false)
    .option("--detached", "No effect: the node always runs as a detached Docker container", false)
    .option("--json", "Output as JSON", false)
    .action(async (opts) => {
      await runLocalnetStart({
        profile: opts.toccata ? "toccata-v2" : opts.profile,
        json: opts.json,
        workspaceRoot: process.cwd()
      });
    });

  localnet
    .command("stop")
    .description(`Stop the Docker rusty-kaspad node of the toccata-v2 profile and its miner; needs Docker ${UI.maturity("alpha")}`)
    .option("--profile <name>", "Localnet profile: toccata-v2 (the only one)", "toccata-v2")
    .option("--toccata", "Shortcut for --profile toccata-v2", false)
    .option("--json", "Output as JSON", false)
    .action(async (opts) => {
      await runLocalnetStop({
        profile: opts.toccata ? "toccata-v2" : opts.profile,
        json: opts.json,
        workspaceRoot: process.cwd()
      });
    });

  localnet
    .command("status")
    .description(`Show localnet status ${UI.maturity("alpha")}`)
    .option("--json", "Output as JSON", false)
    .action(async (opts) => {
      await runLocalnetStatus({
        json: opts.json,
        workspaceRoot: process.cwd()
      });
    });

  localnet
    .command("fund <identifier>")
    .description(`Fund a local Toccata/simnet account ${UI.maturity("alpha")}`)
    .option("--profile <name>", "Funding profile", "toccata-v2")
    .option("--amount <kas>", "KAS to wait for: mine until the mature balance grows by this amount", "1000")
    .option("--timeout <ms>", "Funding/maturity wait timeout in ms", "300000")
    .option("--keep-miner", "Keep mining to the funded account after funding (its balance keeps growing)", false)
    .option("--stop-miner", "Leave the chain stopped after funding: no new blocks until you mine again", false)
    .option("--json", "Output as JSON", false)
    .action(async (identifier, opts) => {
      await runLocalnetFund({
        identifier,
        amountSompi: parseKasToSompi(opts.amount),
        profile: opts.profile,
        timeoutMs: parseInt(opts.timeout, 10),
        keepMiner: opts.keepMiner,
        stopMiner: opts.stopMiner,
        json: opts.json,
        workspaceRoot: process.cwd()
      });
    });

  const accountCmd = localnet
    .command("account")
    .description("Manage simulated localnet accounts");

  accountCmd
    .command("create <name>")
    .description(`Create a simulated localnet account ${UI.maturity("alpha")}`)
    .option("--json", "Output as JSON", false)
    .action(async (name: string, options: any) => {
      const { runLocalnetAccountCreate } =
        await import("../runners/localnet-account-runners.js");
      await runLocalnetAccountCreate(name, options);
    });

  localnet
    .command("fork")
    .description(
      `Copy the current UTXOs of some addresses from a node into a simulator state file ${UI.maturity("preview")}`
    )
    .requiredOption("--network <name>", "Network to fork from")
    .option("--addresses <addrs...>", "Addresses whose UTXOs are copied, separated by spaces")
    .requiredOption(
      "--at-daa-score <score>",
      "Required label recorded with the snapshot; the UTXOs copied are always the node's current ones"
    )
    .option("--output <path>", "State file to write (default: .hardkas/localnet.json, replaced)")
    .option("--json", "Not implemented yet: no JSON is printed", false)
    .action(async (opts) => {
      await runLocalnetFork({
        network: opts.network,
        addresses: opts.addresses || [],
        atDaaScore: opts.atDaaScore,
        outputPath: opts.output,
        workspaceRoot: process.cwd()
      });
    });

  const snapshotCmd = localnet
    .command("snapshot")
    .description("Manage HardKAS localnet snapshots");

  snapshotCmd
    .command("verify <idOrName>")
    .description(`Verify the integrity of a snapshot ${UI.maturity("preview")}`)
    .option("--json", "Output as JSON", false)
    .action(async (idOrName: string, options: { json: boolean }) => {
      const { runSnapshotVerify } = await import("../runners/snapshot-verify-runner.js");
      // WORKSPACE-AUTHORITY-1 (WA-I0): the snapshot commands act on the invocation's one workspace root
      await runSnapshotVerify({ idOrName, ...options, workspaceRoot: invocationWorkspaceRoot() });
    });

  snapshotCmd
    .command("create <name>")
    .description(
      `Create a deterministic snapshot of current localnet state ${UI.maturity("alpha")}`
    )
    .option(
      "--consensus-validated",
      "Mark snapshot as validated by consensus (strict)",
      false
    )
    .option("--json", "Output as JSON", false)
    .action(
      async (name: string, options: { consensusValidated: boolean; json: boolean }) => {
        const { runSnapshotCreate } =
          await import("../runners/snapshot-create-runner.js");
        await runSnapshotCreate({
          name,
          consensusValidated: options.consensusValidated,
          json: options.json,
          workspaceRoot: invocationWorkspaceRoot()
        });
      }
    );

  snapshotCmd
    .command("replay <name>")
    .description(
      `Restore a snapshot's missing artifacts into the workspace; never removes or overwrites one ${UI.maturity("alpha")}`
    )
    .option("--json", "Output as JSON", false)
    .action(async (name: string, options: { json: boolean }) => {
      const { runSnapshotReplay } = await import("../runners/snapshot-replay-runner.js");
      await runSnapshotReplay({ name, json: options.json, workspaceRoot: invocationWorkspaceRoot() });
    });
}
