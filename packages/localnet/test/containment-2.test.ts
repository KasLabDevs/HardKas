import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { getTracePath } from "../src/traces.js";

// CONTAINMENT-2 (R1) · a trace file is named after the receipt's txId. A txId holding ':' would address an NTFS
// alternate stream of another file, and a device name would not be a plain file: both are refused. (A trailing dot or
// space does not apply here: `.trace.json` always follows the txId.) Path computation only: nothing touches the disk.

const cwd = path.join(os.tmpdir(), "hk-containment-2-traces");
const HEX = "a".repeat(64);
const accepted = (txIds: string[]) =>
  txIds.filter((t) => {
    try {
      getTracePath(t, cwd);
      return true;
    } catch {
      return false;
    }
  });

describe("CONTAINMENT-2 · trace file names", () => {
  it("refuses a txId with ':' (an alternate stream) or a device name", () => {
    expect(accepted(["ab:cd", `${HEX}:stream`, "CON", "nul"])).toEqual([]);
  });

  it("controls: a network txId and a simulator txId", () => {
    expect([getTracePath(HEX, cwd), getTracePath(`synthetic-${HEX}`, cwd)]).toEqual([
      path.join(cwd, ".hardkas", "artifacts", `${HEX}.trace.json`),
      path.join(cwd, ".hardkas", "artifacts", `synthetic-${HEX}.trace.json`)
    ]);
  });
});
