import { Command } from "commander";
import { UI } from "@hardkas/cli/extension-kit";

/**
 * `l2 metamask …`. The core has not registered a root `metamask` group since SURFACE-TRUTH-1B, so the extension
 * adds no root alias either: there is no former entry point to keep.
 */
export function registerMetamaskCommands(parent: Command) {
  const metamaskCmd = parent
    .command("metamask")
    .description("MetaMask onboarding and account export (local-dev only)");

  metamaskCmd.hook("preAction", () => {
    if (!process.env.HARDKAS_EXPERIMENTAL) {
      console.warn(
        "\n⚠️  WARNING: 'metamask' commands are highly experimental and unsupported. Set HARDKAS_EXPERIMENTAL=1 to acknowledge.\n"
      );
    }
  });

  metamaskCmd
    .command("network")
    .description(
      `Show local Igra network parameters for MetaMask ${UI.maturity("stable")}`
    )
    .option("--profile <name>", "L2 network profile name (local, igra-galleon, igra-mainnet)", "local")
    .option("--json", "Output as JSON", false)
    .action(async (options: any) => {
      const { runMetamaskNetwork } = await import("../runners/metamask-runner.js");
      await runMetamaskNetwork(options);
    });

  metamaskCmd
    .command("snippet")
    .description(
      `Generate JS snippet to add local network to MetaMask ${UI.maturity("stable")}`
    )
    .option("--profile <name>", "L2 network profile name (local, igra-galleon, igra-mainnet)", "local")
    .action(async (options: any) => {
      const { runMetamaskSnippet } = await import("../runners/metamask-runner.js");
      await runMetamaskSnippet(options);
    });

  metamaskCmd
    .command("account <name>")
    .description(
      `Export a local EVM account for MetaMask import ${UI.maturity("stable")}`
    )
    .option("--show-private-key", "Reveal the private key (LOCAL DEV ONLY)", false)
    .option("--json", "Output as JSON", false)
    .option("--include-secret", "Include secret in JSON output (UNSAFE)", false)
    .action(async (name: string, options: any) => {
      const { runMetamaskAccount } = await import("../runners/metamask-runner.js");
      await runMetamaskAccount(name, options);
    });
}
