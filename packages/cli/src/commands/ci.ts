import { Command } from "commander";
import { UI } from "../ui.js";
import { runDoctorChecks } from "./doctor.js";
import fs from "fs";
import path from "path";
import { invocationWorkspaceRoot } from "../workspace-root.js";

export function registerCiCommand(program: Command) {
  const ciCmd = program
    .command("ci")
    .description("Continuous Integration and DevSecOps commands");

  ciCmd
    .command("verify")
    .description(
      "Non-interactively verify workspace integrity, artifacts, and projections"
    )
    .action(async () => {
      try {
        UI.header("CI Workspace Verification");

        // WORKSPACE-AUTHORITY-1 (WA-I0): the invocation's one root
        const root = invocationWorkspaceRoot();
        const hardkasDir = path.join(root, ".hardkas");
        const artifactsDir = path.join(hardkasDir, "artifacts");

        let hasErrors = false;

        // 1. Doctor checks
        UI.step(1, "Running environment doctor checks...");
        try {
          const doctorOk = await runDoctorChecks(root, { quiet: true });
          if (!doctorOk) {
            UI.error("Environment doctor checks failed.");
            hasErrors = true;
          } else {
            UI.success("Environment checks passed.");
          }
        } catch (e: unknown) {
          UI.error(`Doctor failed: ${((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))}`);
          hasErrors = true;
        }

        // 2. Artifacts duplication/consistency
        UI.step(2, "Scanning artifact lattice integrity...");
        if (!fs.existsSync(artifactsDir)) {
          UI.warning("No artifacts directory found. Skipping lattice scan.");
        } else {
          // WORKSPACE-AUTHORITY-1 (C1): the artifact store the resolver reads (all its canonical subdirectories), counted
          // as distinct identities; its files are counted apart.
          const { countWorkspaceArtifactsSync } = await import("@hardkas/artifacts");
          const counts = countWorkspaceArtifactsSync(root);
          if (counts.unverified === 0) {
            UI.success(`Scanned ${counts.artifacts} artifacts cleanly (${counts.entries} store files).`);
          } else {
            UI.warning(
              `Scanned ${counts.artifacts} artifacts (${counts.entries} store files); ${counts.unverified} store file(s) do not verify as an artifact identity. Run 'hardkas verify' for details.`
            );
          }
        }

        // 3. Projection consistency · WORKSPACE-AUTHORITY-1: the projection is observed, never created or opened for
        // writing (WA-I3), and reported fresh only when proven built from the workspace's current state (WA-I2). A stale
        // projection is not corruption — the query commands read the workspace instead — so it warns; an unreadable one fails.
        UI.step(3, "Verifying projection index...");
        const { readProjectionStatus } = await import("@hardkas/query-store");
        const projection = readProjectionStatus(root, path.join(hardkasDir, "store.db"));
        if (projection.state === "absent") {
          UI.warning("No projection database found (the query commands read the workspace). Skipping projection checks.");
        } else if (projection.state === "fresh") {
          UI.success("Projection is fresh: built from the workspace's current artifacts and event ledger.");
        } else if (projection.state === "stale") {
          UI.warning(`Projection is stale (${projection.reason}); the query commands read the workspace. Run 'hardkas query store rebuild'.`);
        } else {
          UI.error(`Projection index is unreadable: ${projection.reason}`);
          hasErrors = true;
        }

        UI.emptyLine();
        UI.emptyLine();
        if (hasErrors) {
          const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
          throw new HardkasCliError(
            "CI_VERIFY_FAILED",
            "CI Verification Failed. Workspace is corrupted or incorrectly configured.",
            { exitCode: HardkasExitCode.RUNTIME_FAILURE }
          );
        } else {
          UI.success("CI Verification Passed. Workspace is pristine.");
          return;
        }
      } catch (e: unknown) {
        // Wave 9 · DEF-18 · Gate B pass: let typed HardkasCliError instances
        // (e.g. the CI_VERIFY_FAILED thrown above at hasErrors) propagate
        // untouched to the top-level renderer. The previous
        // `if (name === "HardkasCliError") throw new Error("Command failed")`
        // branch destroyed the typed code, forcing the user-facing envelope
        // to `UNKNOWN_ERROR` / `"Command failed"` on both human and JSON paths.
        // Non-HardkasCliError exceptions are still wrapped into a typed
        // CI_ERROR below (adjacent behaviour preserved).
        if (((e as any).name) === "HardkasCliError") throw e;
        const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
        throw new HardkasCliError("CI_ERROR", ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) || String(e), {
          exitCode: HardkasExitCode.RUNTIME_FAILURE
        });
      }
    });
}
