import { Command } from "commander";
import { runArtifactVerify } from "../runners/artifact-verify-runner.js";
import { runSemanticVerify } from "../runners/semantic-verify-runner.js";
import { UI, handleError } from "../ui.js";
import { requireExistingWorkspace } from "../workspace-root.js";

export function registerVerifyCommand(program: Command) {
  program
    .command("verify")
    .description(
      `Verify artifact integrity and lineage continuity across the workspace ${UI.maturity("stable")}`
    )
    // Closure Pack D-Q20 / AUX-08: an optional target, contained in the workspace.
    // Without it, every artifact under .hardkas/artifacts is verified. Excess
    // positional arguments are a usage error (never silently ignored).
    .argument("[path]", "Workspace-contained artifact file or directory to verify (default: .hardkas/artifacts)")
    .option("--json", "Output machine-readable JSON", false)
    .action(async (targetPath: string | undefined, opts) => {
      try {
        if (opts.json) UI.setJsonMode(true);
        // WORKSPACE-AUTHORITY-1: the invocation's one workspace root (WA-I0); verifying reads an existing workspace and
        // never creates one (WA-I3)
        const workspaceRoot = requireExistingWorkspace("verify").root;

        if (targetPath === undefined) {
          // By default, verify acts on the canonical artifacts directory
          const path = await import("node:path");
          const artifactsPath = path.join(workspaceRoot, ".hardkas", "artifacts");

          const fs = await import("fs");
          if (!fs.existsSync(artifactsPath)) {
            if (opts.json) {
              const { getOutput } = await import("../output.js");
              getOutput().writeJson({ ok: true, command: "verify", mode: "cli", result: { artifactsVerified: 0 } });
            } else {
              UI.success("No artifacts found to verify.");
            }
            return;
          }
        }

        // AUD-12: strict in every mode; the runner applies strict to integrity,
        // semantics and references alike (IC-4′.3).
        await runArtifactVerify({
          path: targetPath ?? ".hardkas/artifacts",
          recursive: targetPath === undefined ? true : undefined,
          strict: true,
          json: opts.json,
          workspaceRoot,
          containedInWorkspace: true,
          command: "verify",
          storeVerification: true
        });
      } catch (err: any) {
        if (!opts.json) {
          handleError(err);
        }
        throw err;
      }
    });

  program
    .command("verify-semantics")
    // ESCALÓN 3 · P5: the command refuses (VERIFY_SEMANTICS_UNSUPPORTED); its help no longer says it verifies anything
    .description(
      "Unsupported: always refuses with VERIFY_SEMANTICS_UNSUPPORTED (no HardKAS subsystem records the semantic hashes it would compare); use 'hardkas verify' for artifact integrity and lineage"
    )
    .option("--json", "Output the refusal as a JSON envelope", false)
    .option("--ci-mode", "No effect: the command always refuses", false)
    .action(async (opts) => {
      if (opts.json) UI.setJsonMode(true);
      // SURFACE-TRUTH-1A: the runner's typed error reaches the renderer unchanged. Rewrapping every error as
      // SEMANTIC_DRIFT reported usage errors and missing input as detected drift.
      await runSemanticVerify({
        json: opts.json,
        ciMode: opts.ciMode
      });
    });
}
