import path from "node:path";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

/**
 * SNAPSHOT-NAME-TRAVERSAL-1: the directory of snapshot `name` in a workspace. A name is one plain path segment under
 * `<workspace>/snapshots`; a separator, a drive, "." or "..", or anything else that would resolve outside that directory
 * is refused (SNAPSHOT_NAME_INVALID) before any file is read or written.
 */
export function snapshotDirFor(workspaceRoot: string, name: string): string {
  const snapshotsDir = path.resolve(workspaceRoot, "snapshots");
  const dir = path.resolve(snapshotsDir, String(name));
  const oneSegment =
    typeof name === "string" && name !== "" && name !== "." && name !== ".." && !/[\\/:\0]/.test(name) && path.dirname(dir) === snapshotsDir;
  if (!oneSegment) {
    throw new HardkasCliError(
      "SNAPSHOT_NAME_INVALID",
      `${JSON.stringify(name)} is not a snapshot name: use one plain name (no '/', '\\', ':', '.' or '..'), stored under ${snapshotsDir}; nothing was read or written`,
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }
  return dir;
}
