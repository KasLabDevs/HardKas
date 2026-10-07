import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { plainChildPath } from "../src/fs.js";

// CONTAINMENT-2 (R1) · plainChildPath (snapshots, deployments, and now keystores and locks) also refuses the names
// Windows maps to something other than a plain child file: a device name, with or without an extension, and a name
// ending in a dot or a space (Win32 strips them, so the name aliases another file). The rule is the same on every
// platform, so a workspace stays portable. A logical check, no I/O: these names are never touched on disk here.

const base = path.join(os.tmpdir(), "hk-containment-2-plain-child");
const accepted = (names: string[]) => names.filter((n) => plainChildPath(base, n) !== undefined);

describe("CONTAINMENT-2 · plainChildPath and Windows-hostile names", () => {
  it("refuses device names, with or without an extension, in any case", () => {
    expect(accepted(["CON", "con", "PRN", "AUX", "NUL", "nul.json", "CON.json", "COM1", "com9.txt", "LPT1", "lpt9.log", "CONIN$", "CONOUT$"])).toEqual([]);
  });

  it("refuses a trailing dot or space", () => {
    expect(accepted(["a.", "a ", "a.json.", "a.json ", "...", " "])).toEqual([]);
  });

  it("controls: ordinary names are still one plain child", () => {
    const names = ["alice.json", "my-snap", "a.b", "console", "nullable", "com10", "lpt", "con1.json"];
    expect(names.map((n) => plainChildPath(base, n))).toEqual(names.map((n) => path.join(base, n)));
  });
});
