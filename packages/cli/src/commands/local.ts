import { Command } from "commander";
import { UI } from "../ui.js";

export function registerLocalCommands(program: Command) {
  const localCmd = program
    .command("local")
    .description("Local development and environment lifecycle tools");

  localCmd
    .command("wizard")
    .description(`Guided Igra L2 (EVM) check: JSON-RPC, EVM account and its balance; not a Kaspa L1 setup ${UI.maturity("stable")}`)
    .option("--profile <name>", "L2 network profile name", "igra")
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
