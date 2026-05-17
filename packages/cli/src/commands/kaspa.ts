import { Command } from "commander";
import { UI } from "../ui.js";

export function registerKaspaCommands(program: Command) {
  const kaspaCmd = program
    .command("kaspa")
    .description("Kaspa L1 native developer tools");

  const walletCmd = kaspaCmd
    .command("wallet")
    .description("Manage local Kaspa L1 wallets");

  walletCmd
    .command("create <name>")
    .description(`Create a new local Kaspa wallet ${UI.maturity("stable")}`)
    .option("--network <id>", "Kaspa network ID", "simnet")
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
    .option("--rpc-url <url>", "Kaspa RPC URL", "http://127.0.0.1:16110")
    .option("--json", "Output as JSON", false)
    .action(async (name: string, options: any) => {
      const { runKaspaWalletBalance } = await import("../runners/kaspa-wallet-runner.js");
      await runKaspaWalletBalance(name, options);
    });

  walletCmd
    .command("send <from> <to>")
    .description(`Send Kaspa between local wallets ${UI.maturity("stable")}`)
    .option("--amount <kas>", "Amount in KAS to send")
    .option("--dry-run", "Plan but do not sign or broadcast", false)
    .option("--rpc-url <url>", "Kaspa RPC URL", "http://127.0.0.1:16110")
    .action(async (from: string, to: string, options: any) => {
      const { runKaspaWalletSend } = await import("../runners/kaspa-wallet-runner.js");
      await runKaspaWalletSend(from, to, options);
    });

  kaspaCmd
    .command("doctor")
    .description(`Verify local Kaspa L1 environment readiness ${UI.maturity("stable")}`)
    .option("--rpc-url <url>", "Kaspa RPC URL", "http://127.0.0.1:16110")
    .option("--json", "Output as JSON", false)
    .action(async (options: any) => {
      const { runKaspaDoctor } = await import("../runners/kaspa-doctor-runner.js");
      await runKaspaDoctor(options);
    });
}
