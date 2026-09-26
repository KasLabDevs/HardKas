import { Command } from "commander";
import pc from "picocolors";
import path from "node:path";
import { UI } from "../ui.js";
import { LookupUsageError, lookupFromArgs, namespaceRequiredHint } from "../runners/lookup-args.js";

export function registerExplainCommand(program: Command) {
  program
    .command("explain [artifact]")
    .description(
      `Provide a narrative causal explanation of an artifact resolved by exact artifactId, artifact file path, or a namespaced identifier (--plan, --signed, --tx, --workflow) ${UI.maturity("stable")}`
    )
    .option("--artifact <id-or-path>", "64-hex artifactId or workspace path (same as the positional)")
    .option("--plan <planId>", "Resolve a plan by its derived label (verified against its hash)")
    .option("--signed <signedId>", "Resolve a signed transaction by its derived label (verified)")
    .option("--tx <txId>", "Resolve the submission receipt for a txId (never the signed)")
    .option("--workflow <workflowId>", "Resolve a workflow run by its correlation id")
    .option("--workspace <path>", "Override workspace root directory")
    .action(
      async (
        artifactInput: string | undefined,
        options: { workspace?: string; artifact?: string; plan?: string; signed?: string; tx?: string; workflow?: string }
      ) => {
        const workspaceRoot = options.workspace
          ? path.resolve(options.workspace)
          : process.cwd();

        // Wave 5 · DEF-17: single delegation point. Wave 1.2 · IC-5′: namespaced,
        // verified lookups; an untyped input is only a path or a 64-hex artifactId.
        const { resolveArtifactHandle } = await import("@hardkas/artifacts");

        let lookup;
        try {
          lookup = lookupFromArgs(artifactInput, options);
        } catch (e: any) {
          if (e instanceof LookupUsageError) {
            UI.semanticError("Usage", e.message, "identity contract", "one target per call", "pass an artifactId, a path, or exactly one of --plan/--signed/--tx/--workflow");
            throw new Error("Command failed");
          }
          throw e;
        }

        let handle;
        try {
          handle = await resolveArtifactHandle(
            lookup.input,
            workspaceRoot,
            lookup.namespace ? { namespace: lookup.namespace } : {}
          );
        } catch (e: any) {
          const code = e?.code || "ARTIFACT_UNKNOWN";
          UI.semanticError(
            code === "NAMESPACE_REQUIRED" ? "Namespace Required" : code === "CANDIDATE_INVALID" ? "Artifact Does Not Verify" : "Artifact Not Found",
            e?.message || `Could not resolve '${lookup.input}'`,
            "causal chain integrity",
            "cannot explain deterministic causality for missing or unverifiable data",
            code === "NAMESPACE_REQUIRED"
              ? namespaceRequiredHint("explain", e)
              : code === "ARTIFACT_INPUT_IS_DIRECTORY"
                ? "pass an exact artifactId or artifact file path, not a directory"
                : code === "CANDIDATE_INVALID"
                  ? "the file claiming this identity does not verify; run `hardkas artifact verify <path>` on it"
                  : code === "ARTIFACT_INPUT_UNRECOGNIZED"
                    ? "pass a 64-hex artifactId or a workspace path to an artifact .json file"
                    : "verify the artifactId or path and ensure you are in the correct HardKAS workspace"
          );
          throw new Error("Command failed");
        }

        const artifact = handle.artifact as Record<string, unknown>;
        const isSimulated =
          artifact.mode === "simulated" || artifact.networkId === "simulated" || artifact.mode === "simulator";
        const schema = (artifact.schema as string) || "unknown";

        console.log(
          `\n  ${pc.magenta("═════")} ${pc.bold("Deterministic Explanation")} ${pc.magenta("═════")}\n`
        );

        console.log(
          pc.white(
            `  This artifact represents a ${pc.cyan(schema)} generated during a ${
              isSimulated ? "local simulated execution" : "network interaction"
            }.\n`
          )
        );

        // Wave 1.5 · AUD-14 (simulator part): `explain` prints only what it computed.
        // The identity check is computed by the resolver (authScope); no replay runs
        // here, so no replay result is printed — the command that computes one is named.
        UI.causality("Execution Trace", {
          // IC-5′.11: the canonical identity, labelled as such; a txId is shown as a txId.
          "Artifact ID": handle.artifactId,
          ...(typeof artifact.txId === "string" ? { "Tx ID": artifact.txId } : {}),
          "Authentication Scope": handle.authScope,
          "Resolved By": handle.resolvedBy,
          "Source Authority": "filesystem artifact",
          "File Path": handle.path,
          "Projection Layer": "SQLite query-store (indexed while the dashboard runs)",
          Integrity:
            handle.authScope === "FULL"
              ? "verified: the body recomputes to this artifactId (FULL scope)"
              : `verified within a ${handle.authScope} authentication scope only`,
          Replay: isSimulated
            ? `not run by explain; run \`hardkas replay verify ${handle.artifactId}\` to reproduce it`
            : "network state dependent",
          "Consensus Validation": isSimulated
            ? "NOT performed"
            : "performed by remote node",
          Reason: isSimulated
            ? "simulated execution mode does not validate against Kaspa consensus"
            : "network interaction implies Kaspa consensus"
        });
      }
    );
}
