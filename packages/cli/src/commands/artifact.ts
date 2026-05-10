import { Command } from "commander";
import { handleError, UI } from "../ui.js";
import { runArtifactVerify } from "../runners/artifact-verify-runner.js";
import { runArtifactExplain } from "../runners/artifact-explain-runner.js";

export function registerArtifactCommands(program: Command) {
  const artifactCmd = program.command("artifact").description("Manage HardKAS artifacts");

  artifactCmd
    .command("verify <path>")
    .description(`Verify an artifact's integrity and schema ${UI.maturity("stable")}`)
    .option("--json", "Output results as JSON", false)
    .option("--recursive", "Recursively verify all artifacts in a directory", false)
    .option("--strict", "Perform deep semantic and operational safety verification", false)
    .action(async (path: string, options: any) => {
      try {
        await runArtifactVerify({ path, ...options });
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  artifactCmd
    .command("explain <path>")
    .description(`Provide a human-readable operational summary of an artifact ${UI.maturity("preview")}`)
    .action(async (path: string) => {
      try {
        await runArtifactExplain({ path });
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  artifactCmd
    .command("lineage <path>")
    .description(`Show the provenance and operational history of an artifact ${UI.maturity("preview")}`)
    .action(async (path: string) => {
      try {
        const { runArtifactLineage } = await import("../runners/artifact-lineage-runner.js");
        await runArtifactLineage({ path });
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });
}
