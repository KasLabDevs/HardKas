import { Command } from "commander";
import { UI, handleError } from "../ui.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

export function registerRebuildCommand(program: Command) {
  program
    .command("rebuild")
    .description(`Reconstruct projections from committed canonical artifacts ${UI.maturity("stable")}`)
    .option("--from-artifacts", "Rebuild the query-store and localnet projection from artifacts", false)
    .option("--json", "Output machine-readable JSON", false)
    .action(async (opts) => {
      try {
        if (opts.json) UI.setJsonMode(true);
        
        if (!opts.fromArtifacts) {
          throw new HardkasCliError("USAGE_ERROR", "Must specify --from-artifacts to confirm rebuild action.", { exitCode: HardkasExitCode.USAGE_ERROR });
        }

        const { withLock } = await import("@hardkas/core");
        await withLock({
          rootDir: process.cwd(),
          name: "query-store",
          command: "hardkas rebuild",
          wait: false,
          timeoutMs: 30000
        }, async () => {
          if (!opts.json) UI.info("Rebuilding projections from canonical artifacts...");
          
          const path = await import("node:path");
          const { HardkasStore, SqliteQueryBackend } = await import("@hardkas/query-store");
          const store = new HardkasStore({ dbPath: path.join(process.cwd(), ".hardkas", "store.db") });
          store.connect({ autoMigrate: true });
          
          const backend = new SqliteQueryBackend(store);
          const result = await backend.rebuild({ strict: true });
          
          if (opts.json) {
            UI.writeJson(result);
          } else {
            if (!result.ok) {
              throw new HardkasCliError("RUNTIME_FAILURE", "Rebuild failed or encountered corruption.", { exitCode: HardkasExitCode.RUNTIME_FAILURE });
            }
            UI.success(`Rebuild complete. Indexed ${result.artifacts.indexed} artifacts.`);
          }
        });
      } catch (err: any) {
        if (opts.json) {
          UI.writeJson({
            error: "REBUILD_FAILED",
            message: err.message,
            code: err.code || "UNKNOWN_ERROR"
          });
        } else {
          handleError(err);
        }
        process.exit(err instanceof HardkasCliError ? err.exitCode : HardkasExitCode.RUNTIME_FAILURE);
      }
    });
}
