import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";

vi.setConfig({ testTimeout: 60_000 });

// AUD-24 (PAPERCUTS-1) · `hardkas node reset` resolved the node's data directory (`.hardkas/kaspad`) and its lock against
// the directory it was run from: from a subdirectory it deleted `<subdir>/.hardkas/kaspad` (or nothing) and still said
// "reset complete". Decided: the reset acts on the workspace whose `hardkas.config.*` it runs under; with no workspace it
// fails, and never falls back to the current directory. The node runners are doubles (no Docker); the command is real.

vi.mock("../src/runners/node-reset-runner.js", () => ({
  runNodeReset: vi.fn(async () => ({ status: { running: false }, formatted: "Kaspa node reset complete." }))
}));
vi.mock("../src/runners/node-start-runner.js", () => ({
  runNodeStart: vi.fn(async () => ({ formatted: "started" }))
}));

import { registerNodeCommands } from "../src/commands/node.js";
import { runNodeReset } from "../src/runners/node-reset-runner.js";
import { runNodeStart } from "../src/runners/node-start-runner.js";

const program = () => {
  const p = new Command();
  p.exitOverride();
  registerNodeCommands(p);
  return p;
};

describe("node reset · acts on the workspace, never on the current directory", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-node-reset-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(runNodeReset).mockClear();
    vi.mocked(runNodeStart).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("run from a subdirectory of a workspace, it resets the workspace's node data (and takes its lock there)", async () => {
    fs.writeFileSync(path.join(root, "hardkas.config.ts"), "export default {};");
    const sub = path.join(root, "src", "deep");
    fs.mkdirSync(sub, { recursive: true });
    vi.spyOn(process, "cwd").mockReturnValue(sub);
    await program().parseAsync(["node", "reset", "--yes", "--start"], { from: "user" });
    expect(vi.mocked(runNodeReset)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runNodeReset).mock.calls[0]![0]).toMatchObject({ removeData: true, cwd: root });
    expect(vi.mocked(runNodeStart).mock.calls[0]![0], "the restart uses the same data").toMatchObject({ cwd: root });
    expect(fs.existsSync(path.join(sub, ".hardkas")), "nothing under the subdirectory").toBe(false);
  });

  it("with no workspace, it fails and resets nothing", async () => {
    const lonely = path.join(root, "no-workspace");
    fs.mkdirSync(lonely);
    const { loadHardkasConfig } = await import("@hardkas/config");
    expect((await loadHardkasConfig({ cwd: lonely })).path, "precondition: no hardkas.config.* up the tree").toBeUndefined();
    vi.spyOn(process, "cwd").mockReturnValue(lonely);
    await expect(program().parseAsync(["node", "reset", "--yes"], { from: "user" })).rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND" });
    expect(vi.mocked(runNodeReset)).not.toHaveBeenCalled();
  });
});
