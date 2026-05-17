import { Command } from "commander";
import { UI } from "../ui.js";

export function registerLocalCommands(program: Command) {
  const localCmd = program
    .command("local")
    .description("Local development and environment lifecycle tools");

  localCmd
    .command("wizard")
    .description(`Guided setup for local development ${UI.maturity("stable")}`)
    .option("--profile <name>", "L2 network profile name", "igra")
    .option("--account <name>", "New or existing EVM account name", "dev_alice")
    .option("--non-interactive", "Skip interactive prompts (will fail if input required)", false)
    .option("--json", "Output as JSON", false)
    .action(async (options: any) => {
      const { runLocalWizard } = await import("../runners/local-wizard-runner.js");
      await runLocalWizard(options);
    });
}
