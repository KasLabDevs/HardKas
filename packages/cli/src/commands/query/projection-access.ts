import type { HardkasStore, ProjectionStatus } from "@hardkas/query-store";
import { invocationWorkspaceRoot } from "../../workspace-root.js";
import { getOutput } from "../../output.js";
import { queryStorePath } from "./engine-factory.js";

/**
 * WORKSPACE-AUTHORITY-1 · a command whose subject IS the projection (`query store sql`, `query store export`): it opens
 * the existing projection without creating, migrating or reconfiguring it (WA-I3), and reads it even when it is not
 * fresh — that is what was asked — but says so (B2). The caller disconnects the store.
 */
export async function openProjectionForCommand(command: string): Promise<{ store: HardkasStore; status: ProjectionStatus }> {
  const root = invocationWorkspaceRoot();
  const dbPath = queryStorePath(root);
  const { HardkasStore, projectionStatusOf } = await import("@hardkas/query-store");
  const store = HardkasStore.openExisting(dbPath);
  if (!store) {
    const { HardkasCliError } = await import("../../cli-errors.js");
    throw new HardkasCliError(
      "QUERY_STORE_ABSENT",
      `There is no query store at ${dbPath}; '${command}' reads it and creates none. Build it with 'hardkas query store rebuild'.`,
      { exitCode: 1 }
    );
  }
  let status: ProjectionStatus;
  try {
    status = projectionStatusOf(store, root);
  } catch (e: unknown) {
    status = { state: "unreadable", dbPath, reason: e instanceof Error ? e.message : String(e) };
  }
  if (status.state !== "fresh") {
    getOutput().warn(
      `⚠ The query store is ${status.state.toUpperCase()} (${status.reason}). '${command}' reads it as requested; it may not match the workspace. Run 'hardkas query store rebuild'.`
    );
  }
  return { store, status };
}
