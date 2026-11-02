import { Command } from "commander";
import { UI } from "@hardkas/cli/extension-kit";

/** `l2 wizard`, and its one-version alias `local wizard` (D6). */
export function addWizardCommand(parent: Command, name: string, aliasOf?: string): void {
  parent
    .command(name)
    // SURFACE-TRUTH-1B (ST-D): an Igra L2 lab check, not a stable L1 command.
    .description(
      `Guided Igra L2 (EVM) check, an L2 lab: JSON-RPC, EVM account and its balance; not a Kaspa L1 setup ${UI.maturity("experimental")}` +
        (aliasOf ? ` (alias of \`${aliasOf}\`, kept for one version)` : "")
    )
    .option("--profile <name>", "L2 network profile name (local, igra-galleon, igra-mainnet)", "local")
    .option("--account <name>", "EVM account name in hardkas.config (if it is missing, a key is printed for you to add)", "dev_alice")
    .option(
      "--non-interactive",
      "Skip interactive prompts (will fail if input required)",
      false
    )
    .option("--json", "Output as JSON", false)
    .action(async (options: any) => {
      const { runLocalWizard } = await import("../runners/local-wizard-runner.js");
      await runLocalWizard(options);
    });
}

/** The `local` group the core no longer registers: only the `wizard` alias lives in it. */
export function registerLocalCommands(program: Command) {
  const localCmd = program
    .command("local")
    .description("Igra L2 lab alias group: `local wizard` is `l2 wizard`");
  addWizardCommand(localCmd, "wizard", "l2 wizard");
}
