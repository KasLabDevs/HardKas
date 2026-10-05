/**
 * Shared QueryEngine factory for CLI query subcommands.
 *
 * This is the ONLY place where process.env is resolved into explicit QueryEngine configuration. The engine itself never
 * reads environment variables. WORKSPACE-AUTHORITY-1 (WA-I0): the engine reads the invocation's one workspace root.
 */
import path from "node:path";
import { invocationWorkspaceRoot } from "../../workspace-root.js";
import { getOutput } from "../../output.js";

/** The projection file the CLI's query commands and store maintenance use. */
export function queryStorePath(workspaceRoot: string = invocationWorkspaceRoot()): string {
  return process.env.HARDKAS_QUERY_STORE_PATH ?? path.join(workspaceRoot, ".hardkas", "store.db");
}

export async function getQueryEngine() {
  const { QueryEngine } = await import("@hardkas/query");

  const artifactDir = invocationWorkspaceRoot();
  const modeRaw = process.env.HARDKAS_PROJECTION_BACKEND;
  const backendMode =
    modeRaw === "sqlite" || modeRaw === "filesystem" || modeRaw === "auto"
      ? modeRaw
      : "auto";
  const databasePath = queryStorePath(artifactDir);

  const engine = await QueryEngine.create({
    artifactDir,
    backendMode,
    databasePath
  });
  noteProjectionState(engine.backendSelection);
  return engine;
}

/**
 * WORKSPACE-AUTHORITY-1 (WA-I2): a projection that is not proven fresh is said so, on stderr (the JSON on stdout carries
 * the same state in `annotations.projection`): answered from anyway when sqlite was requested explicitly; set aside, with
 * the workspace answering, in auto mode.
 */
function noteProjectionState(selection: { selected: string; projection?: { state: string; reason: string } }): void {
  const projection = selection.projection;
  if (!projection || projection.state === "fresh" || projection.state === "absent") return;
  const out = getOutput();
  if (selection.selected === "sqlite") {
    out.warn(
      `⚠ STALE query projection (${projection.state}: ${projection.reason}). These results come from it because sqlite was requested; they may not match the workspace. Run 'hardkas query store rebuild'.`
    );
  } else {
    out.warn(
      `ℹ The query projection is ${projection.state} (${projection.reason}); this answer comes from the workspace itself. Run 'hardkas query store rebuild' to refresh it.`
    );
  }
}
