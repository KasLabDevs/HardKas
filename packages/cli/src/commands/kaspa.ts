import { Command } from "commander";
import { nodeRpcUrl } from "@hardkas/core";
import { UI } from "../ui.js";

// The JSON wRPC endpoint of the canonical localnet, as for the `rpc` commands: the one definition, never a copy.
const DEFAULT_RPC_URL = nodeRpcUrl();
const RPC_URL_OPTION = `Node wRPC endpoint (default: the canonical localnet, ${DEFAULT_RPC_URL})`;

export function registerKaspaCommands(program: Command) {
  const kaspaCmd = program
    .command("kaspa")
    .description("Kaspa L1 native developer tools");

  const walletCmd = kaspaCmd
    .command("wallet")
    .description("Manage local Kaspa L1 wallets");

  // SECRET-SURFACE-2 (D1 / P1): the key is stored nowhere, so it is printed only on an explicit flag and, without
  // one, nothing is generated (runners/kaspa-wallet-runner.ts).
  walletCmd
    .command("create <name>")
    .description(`Generate a key pair and print its address and config snippet; the private key is printed once, only with --show-private-key; nothing is saved. For a stored, encrypted account use 'accounts real generate' ${UI.maturity("stable")}`)
    .option("--network <id>", "Kaspa network ID", "simnet")
    .option("--show-private-key", "Print the new private key once; you keep the only copy (HardKAS stores nothing and cannot recover it). Without it the command refuses before generating anything", false)
    .option("--json", "Output as JSON (the private key is included only with --show-private-key)", false)
    .action(async (name: string, options: any) => {
      const { runKaspaWalletCreate } = await import("../runners/kaspa-wallet-runner.js");
      await runKaspaWalletCreate(name, options);
    });

  walletCmd
    .command("list")
    .description(`List local Kaspa wallets ${UI.maturity("stable")}`)
    .option("--json", "Output as JSON", false)
    .action(async (options: any) => {
      const { runKaspaWalletList } = await import("../runners/kaspa-wallet-runner.js");
      await runKaspaWalletList(options);
    });

  walletCmd
    .command("address <name>")
    .description(`Show address of a local Kaspa wallet ${UI.maturity("stable")}`)
    .action(async (name: string) => {
      const { runKaspaWalletAddress } = await import("../runners/kaspa-wallet-runner.js");
      await runKaspaWalletAddress(name);
    });

  walletCmd
    .command("balance <name>")
    .description(`Show balance of a local Kaspa wallet ${UI.maturity("stable")}`)
    .option("--rpc-url <url>", RPC_URL_OPTION, DEFAULT_RPC_URL)
    .option("--json", "Output as JSON", false)
    .action(async (name: string, options: any) => {
      const { runKaspaWalletBalance } = await import("../runners/kaspa-wallet-runner.js");
      await runKaspaWalletBalance(name, options);
    });

  walletCmd
    .command("send <from> <to>")
    .description(`Plan, confirm (y/N), sign and submit a payment over --rpc-url; the network and target come from hardkas.config ${UI.maturity("stable")}`)
    .option("--amount <kas>", "Amount in KAS to send")
    .option("--dry-run", "Plan but do not sign or broadcast", false)
    .option("--rpc-url <url>", RPC_URL_OPTION, DEFAULT_RPC_URL)
    .action(async (from: string, to: string, options: any) => {
      const { runKaspaWalletSend } = await import("../runners/kaspa-wallet-runner.js");
      await runKaspaWalletSend(from, to, options);
    });

  kaspaCmd
    .command("doctor")
    .description(`Check one Kaspa node at --rpc-url: reachability, sync state, UTXO index, DAG info and mempool ${UI.maturity("stable")}`)
    .option("--rpc-url <url>", RPC_URL_OPTION, DEFAULT_RPC_URL)
    .option("--json", "Output as JSON", false)
    .action(async (options: any) => {
      const { runKaspaDoctor } = await import("../runners/kaspa-doctor-runner.js");
      await runKaspaDoctor(options);
    });
}
