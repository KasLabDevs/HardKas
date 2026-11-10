import { Command } from "commander";
import { handleError, UI } from "../ui.js";
import { runArtifactVerify } from "../runners/artifact-verify-runner.js";
import { runArtifactExplain } from "../runners/artifact-explain-runner.js";
import { invocationWorkspaceRoot } from "../workspace-root.js";

export function registerArtifactCommands(program: Command) {
  const artifactCmd = program.command("artifact").alias("artifacts").description("Manage HardKAS artifacts");

  artifactCmd
    .command("create <type>")
    .description(
      `Wrap a JSON payload as a content-hashed artifact under a free <type> label; the payload is not validated against any schema (schemaValidation: NOT_VALIDATED) ${UI.maturity("alpha")}`
    )
    .requiredOption("--input <path>", "Input JSON payload file")
    .option("--out <path>", "Output artifact file path")
    .option("--json", "Output results as JSON", false)
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (type: string, options: any) => {
      try {
        const { runArtifactCreate } =
          await import("../runners/artifact-create-runner.js");
        const workspaceRoot = invocationWorkspaceRoot(); // WORKSPACE-AUTHORITY-1 (WA-I0)
        await runArtifactCreate({ type, ...options, workspaceRoot });
      } catch (e) {
        throw e;
      }
    });

  artifactCmd
    .command("inspect <id_or_path>")
    .description(`Deep inspect an artifact by ID or path ${UI.maturity("stable")}`)
    .option("--json", "Output results as JSON", false)
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (idOrPath: string, options: any) => {
      try {
        const { runArtifactInspect } =
          await import("../runners/artifact-inspect-runner.js");
        const workspaceRoot = invocationWorkspaceRoot(); // WORKSPACE-AUTHORITY-1 (WA-I0)
        await runArtifactInspect({ idOrPath, ...options, workspaceRoot });
      } catch (e) {
        throw e;
      }
    });

  artifactCmd
    .command("verify <path>")
    .description(
      `Verify an artifact: integrity (offline, every network), and on request its network level (NETWORK_OBSERVED by a node of its network) and consensus level (CONSENSUS_CONFIRMED by the declared confirmation policy; not finality). Mainnet: offline only ${UI.maturity("stable")}`
    )
    .option("--json", "Output results as JSON", false)
    .option("--recursive", "Recursively verify all artifacts in a directory", false)
    .option(
      "--strict",
      "Perform deep semantic and operational safety verification",
      false
    )
    .option("--network <network>", "Check the artifact's transaction on a node of this network (must be the artifact's own; mainnet is never contacted)")
    .option("--url <url>", "Node wRPC (JSON) endpoint for the network check (default: the one the workspace declares for the network; local networks: their local default)")
    .option("--since <blockHash>", "Virtual-chain cursor for the network check: a chain block before the transaction's acceptance (default: the artifact's own submit point, else the node's pruning point)")
    .option("--min-confirmations <n>", "Blue-score depth for CONSENSUS_CONFIRMED (default: the HardKAS product policy, 100)")
    .option("--require <level>", "Level the verification must reach to succeed: integrity (default), network or consensus")
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (targetPath: string, options: any) => {
      try {
        const workspaceRoot = invocationWorkspaceRoot(); // WORKSPACE-AUTHORITY-1 (WA-I0)
        await runArtifactVerify({ path: targetPath, ...options, workspaceRoot });
      } catch (e) {
        throw e;
      }
    });

  artifactCmd
    .command("migrate <path>")
    .description(
      `Re-issue a legacy artifact as hashVersion 5 plus a MigrationReceipt (never in place) ${UI.maturity("alpha")}`
    )
    .requiredOption("--to <hashVersion>", "Target hash version (only 5 is supported)")
    .option("--migration-id <id>", "Migration identifier recorded in the receipt")
    .option("--json", "Output results as JSON", false)
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (targetPath: string, options: any) => {
      try {
        const { runArtifactMigrate } = await import("../runners/artifact-migrate-runner.js");
        const workspaceRoot = invocationWorkspaceRoot(); // WORKSPACE-AUTHORITY-1 (WA-I0)
        await runArtifactMigrate({
          path: targetPath,
          to: String(options.to),
          ...(options.migrationId ? { migrationId: options.migrationId } : {}),
          json: options.json,
          workspaceRoot
        });
      } catch (e) {
        throw e;
      }
    });

  artifactCmd
    .command("explain <path>")
    .description(
      `Provide a human-readable operational summary of an artifact ${UI.maturity("stable")}`
    )
    .option("--json", "Output as JSON", false)
    .option(
      "--strict",
      "Perform deep semantic and operational safety verification",
      false
    )
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (targetPath: string, options: any) => {
      try {
        const workspaceRoot = invocationWorkspaceRoot(); // WORKSPACE-AUTHORITY-1 (WA-I0)
        await runArtifactExplain({ path: targetPath, ...options, workspaceRoot });
      } catch (e) {
        throw e;
      }
    });

  artifactCmd
    .command("lineage <path>")
    .description(
      `Show the provenance and operational history of an artifact ${UI.maturity("stable")}`
    )
    .option("--json", "Output as JSON", false)
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (targetPath: string, options: any) => {
      try {
        const { runArtifactLineage } =
          await import("../runners/artifact-lineage-runner.js");
        const workspaceRoot = invocationWorkspaceRoot(); // WORKSPACE-AUTHORITY-1 (WA-I0)
        await runArtifactLineage({ path: targetPath, workspaceRoot, ...options });
      } catch (e) {
        throw e;
      }
    });
}
