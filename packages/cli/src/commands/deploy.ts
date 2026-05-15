import { Command } from "commander";
import { UI } from "../ui.js";
import { 
  trackDeployment, 
  listAllDeployments, 
  inspectDeployment, 
  verifyDeploymentStatus, 
  showDeploymentHistory 
} from "../runners/deployment-runners.js";

export function registerDeployCommands(program: Command) {
  const deployCmd = program.command("deploy").description("Track and manage deployments");

  deployCmd.command("track <label>")
    .description(`Create a deployment record for a transaction ${UI.maturity("stable")}`)
    .requiredOption("--network <name>", "Network where deployed")
    .option("--tx-id <txId>", "Transaction ID")
    .option("--plan <artifactId>", "Reference to plan artifact")
    .option("--receipt <artifactId>", "Reference to receipt artifact")
    .option("--status <status>", "Deployment status", "sent")
    .option("--notes <text>", "Notes about this deployment")
    .option("--json", "Output as JSON", false)
    .action(async (label, opts) => {
      const { UI } = await import("../ui.js");
      await trackDeployment({ label, ...opts });
    });

  deployCmd.command("list")
    .description(`List all tracked deployments ${UI.maturity("stable")}`)
    .option("--network <name>", "Filter by network")
    .option("--status <status>", "Filter by status")
    .option("--json", "Output as JSON", false)
    .action(async (opts) => {
      await listAllDeployments(opts);
    });

  deployCmd.command("inspect <label>")
    .description(`Show full details of a deployment ${UI.maturity("stable")}`)
    .requiredOption("--network <name>", "Network")
    .option("--json", "Output as JSON", false)
    .action(async (label, opts) => {
      await inspectDeployment({ label, ...opts });
    });

  deployCmd.command("status <label>")
    .description(`Check deployment status (query RPC if available) ${UI.maturity("stable")}`)
    .requiredOption("--network <name>", "Network")
    .option("--verify", "Verify against RPC node", false)
    .option("--json", "Output as JSON", false)
    .action(async (label, opts) => {
      await verifyDeploymentStatus({ label, ...opts });
    });

  deployCmd.command("history")
    .description(`Show deployment history across all networks ${UI.maturity("stable")}`)
    .option("--json", "Output as JSON", false)
    .action(async (opts) => {
      await showDeploymentHistory(opts);
    });
}
