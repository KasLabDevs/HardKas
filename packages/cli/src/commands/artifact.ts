import { Command } from "commander";
import { handleError, UI } from "../ui.js";
import { runArtifactVerify } from "../runners/artifact-verify-runner.js";
import { runArtifactExplain } from "../runners/artifact-explain-runner.js";
import path from "node:path";

export function registerArtifactCommands(program: Command) {
  const artifactCmd = program.command("artifact").description("Manage HardKAS artifacts");

  artifactCmd
    .command("inspect <id_or_path>")
    .description(`Deep inspect an artifact by ID or path ${UI.maturity("stable")}`)
    .option("--json", "Output results as JSON", false)
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (idOrPath: string, options: any) => {
      try {
        const { runArtifactInspect } = await import("../runners/artifact-inspect-runner.js");
        const workspaceRoot = options.workspace ? path.resolve(options.workspace) : process.cwd();
        await runArtifactInspect({ idOrPath, ...options, workspaceRoot });
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  artifactCmd
    .command("verify <path>")
    .description(`Verify an artifact's integrity and schema ${UI.maturity("stable")}`)
    .option("--json", "Output results as JSON", false)
    .option("--recursive", "Recursively verify all artifacts in a directory", false)
    .option("--strict", "Perform deep semantic and operational safety verification", false)
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (path: string, options: any) => {
      try {
        const workspaceRoot = options.workspace ? path.resolve(options.workspace) : process.cwd();
        await runArtifactVerify({ path, ...options, workspaceRoot });
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  artifactCmd
    .command("explain <path>")
    .description(`Provide a human-readable operational summary of an artifact ${UI.maturity("stable")}`)
    .option("--json", "Output as JSON", false)
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (path: string, options: any) => {
      try {
        const workspaceRoot = options.workspace ? path.resolve(options.workspace) : process.cwd();
        await runArtifactExplain({ path, ...options, workspaceRoot });
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  artifactCmd
    .command("lineage <path>")
    .description(`Show the provenance and operational history of an artifact ${UI.maturity("stable")}`)
    .option("--json", "Output as JSON", false)
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (path: string, options: any) => {
      try {
        const { runArtifactLineage } = await import("../runners/artifact-lineage-runner.js");
        const workspaceRoot = options.workspace ? path.resolve(options.workspace) : process.cwd();
        await runArtifactLineage({ path, workspaceRoot, ...options });
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });
}
