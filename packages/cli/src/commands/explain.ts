import { Command } from "commander";
import pc from "picocolors";
import path from "node:path";
import { UI } from "../ui.js";

export function registerExplainCommand(program: Command) {
  program
    .command("explain <artifact>")
    .description(
      `Provide a narrative causal explanation of an artifact resolved by exact artifactId or artifact file path ${UI.maturity("stable")}`
    )
    .option("--workspace <path>", "Override workspace root directory")
    .action(async (artifactInput: string, options: { workspace?: string }) => {
      try {
        const workspaceRoot = options.workspace
          ? path.resolve(options.workspace)
          : process.cwd();

        // Wave 5 · DEF-17: single delegation point. See
        // packages/artifacts/src/artifact-handle.ts for the accepted forms
        // and typed error contract.
        const { resolveArtifactHandle } = await import("@hardkas/artifacts");

        let handle;
        try {
          handle = await resolveArtifactHandle(artifactInput, workspaceRoot);
        } catch (e: any) {
          const code = e?.code || "ARTIFACT_UNKNOWN";
          UI.semanticError(
            "Artifact Not Found",
            e?.message || `Could not resolve '${artifactInput}'`,
            "causal chain integrity",
            "cannot explain deterministic causality for missing data",
            code === "ARTIFACT_INPUT_IS_DIRECTORY"
              ? "pass an exact artifactId or artifact file path, not a directory"
              : code === "ARTIFACT_INPUT_UNRECOGNIZED"
                ? "pass a 64-hex artifactId or a workspace path to an artifact .json file"
                : "verify the artifactId or path and ensure you are in the correct HardKAS workspace"
          );
          throw new Error("Command failed");
        }

        const artifact = handle.artifact as Record<string, unknown>;
        const isSimulated =
          artifact.mode === "simulated" || artifact.networkId === "simulated";
        const schema = (artifact.schema as string) || "unknown";

        console.log(
          `\n  ${pc.magenta("═════")} ${pc.bold("Deterministic Explanation")} ${pc.magenta("═════")}\n`
        );

        console.log(
          pc.white(
            `  This artifact represents a ${pc.cyan(schema)} generated during a ${
              isSimulated ? "local deterministic replay" : "network interaction"
            }.\n`
          )
        );

        UI.causality("Execution Trace", {
          "Artifact ID":
            (handle.artifactId as string) ||
            (artifact.txId as string) ||
            (artifact.signedId as string) ||
            (artifact.planId as string) ||
            "unknown",
          "Resolved By": handle.resolvedBy,
          "Source Authority": "filesystem artifact",
          "File Path": handle.path,
          "Projection Layer": "Indexed into SQLite query-store (if dashboard is running)",
          "Replay Result": isSimulated
            ? "deterministic reproduction successful"
            : "network state dependent",
          "Consensus Validation": isSimulated
            ? "NOT performed"
            : "performed by remote node",
          Reason: isSimulated
            ? "simulated execution mode does not validate against Kaspa consensus"
            : "network interaction implies Kaspa consensus"
        });
      } catch (e) {
        throw e;
      }
    });
}
