import { Command } from "commander";
import { runArtifactVerify } from "../runners/artifact-verify-runner.js";
import { runSemanticVerify } from "../runners/semantic-verify-runner.js";
import { UI, handleError } from "../ui.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

export function registerVerifyCommand(program: Command) {
  program
    .command("verify")
    .description(
      `Verify artifact integrity and lineage continuity across the workspace ${UI.maturity("stable")}`
    )
    .option("--deep", "Perform a deep validation of signatures and causality", false)
    .option("--json", "Output machine-readable JSON", false)
    .action(async (opts) => {
      try {
        if (opts.json) UI.setJsonMode(true);
        // By default, verify acts on the canonical artifacts directory
        const { Hardkas } = await import("@hardkas/sdk");
        const sdk = await Hardkas.open({ cwd: process.cwd() });
        const artifactsPath = sdk.workspace.resolvePath(".hardkas/artifacts");

        const fs = await import("fs");
        if (!fs.existsSync(artifactsPath)) {
          if (opts.json) {
            UI.writeJson({ ok: true, artifactsVerified: 0 });
          } else {
            UI.success("No artifacts found to verify.");
          }
          return;
        }

        await runArtifactVerify({
          path: ".hardkas/artifacts",
          recursive: true,
          strict: true,
          json: opts.json,
          deep: opts.deep,
          workspaceRoot: process.cwd()
        });
      } catch (err: any) {
        if (opts.json) {
          UI.writeJson({
            error: "VERIFY_FAILED",
            message: err.message,
            code: err.code || "UNKNOWN_ERROR"
          });
        } else {
          handleError(err);
        }
        process.exit(
          err instanceof HardkasCliError ? err.exitCode : HardkasExitCode.RUNTIME_FAILURE
        );
      }
    });

  program
    .command("verify-semantics")
    .description(
      `Verify semantic truth agreement across all HardKAS subsystems ${UI.maturity("alpha")}`
    )
    .option("--json", "Output machine-readable JSON", false)
    .option("--ci-mode", "Verify semantic truth equivalence across OS boundaries", false)
    .action(async (opts) => {
      try {
        if (opts.json) UI.setJsonMode(true);
        await runSemanticVerify({
          json: opts.json,
          ciMode: opts.ciMode
        });
      } catch (err: any) {
        if (opts.json) {
          UI.writeJson({ error: "SEMANTIC_DRIFT", message: err.message });
        } else {
          UI.error(err.message);
        }
        throw new Error("Command failed");
      }
    });
}
