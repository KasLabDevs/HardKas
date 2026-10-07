import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Command } from "commander";

vi.setConfig({ testTimeout: 60_000 });

// WORKSPACE-AUTHORITY-1 (WA-I0) · `--workspace` became one global option, so commander accepts it on every command. Found
// by review of the implementation: a command that does not take its workspace from the invocation root then accepted it
// and acted on the current directory's workspace instead — `node reset --workspace <other>` would reset the current
// project's node data (before, "unknown option"). Decided: an explicit --workspace is honoured or refused, never ignored.

vi.mock("../src/runners/node-reset-runner.js", () => ({
  runNodeReset: vi.fn(async () => ({ status: { running: false }, formatted: "Kaspa node reset complete." }))
}));

import { buildHardkasProgram } from "../src/program.js";
import { COMMANDS_HONORING_WORKSPACE, commandPathOf } from "../src/workspace-root.js";
import { runNodeReset } from "../src/runners/node-reset-runner.js";

const allCommands = (root: Command): Command[] => root.commands.flatMap((c) => [c, ...allCommands(c)]);

describe("--workspace · honoured or refused, never ignored", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-wa1-option-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(runNodeReset).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("every command that honours it is a real command, and every command that declares its own --workspace honours it", () => {
    const commands = allCommands(buildHardkasProgram({ forDocs: true }));
    const paths = new Set(commands.map(commandPathOf));
    for (const entry of COMMANDS_HONORING_WORKSPACE) expect(paths.has(entry), entry).toBe(true);
    const honours = (p: string) => COMMANDS_HONORING_WORKSPACE.some((h) => p === h || p.startsWith(`${h} `));
    const declaring = commands.filter((c) => c.options.some((o) => o.long === "--workspace")).map(commandPathOf);
    expect(declaring.length).toBeGreaterThan(0);
    for (const p of declaring) expect(honours(p), p).toBe(true);
  });

  it("a command that acts on the current directory refuses it, and does nothing", async () => {
    const target = path.join(dir, "target");
    const here = path.join(dir, "here"); // the current directory: no workspace, so nothing here could be reset either
    fs.mkdirSync(target);
    fs.mkdirSync(here);
    fs.writeFileSync(path.join(target, "hardkas.config.ts"), "export default {};");
    vi.spyOn(process, "cwd").mockReturnValue(here);
    const program = buildHardkasProgram();
    program.exitOverride();
    await expect(program.parseAsync(["node", "reset", "--yes", "--workspace", target], { from: "user" })).rejects.toMatchObject({
      code: "WORKSPACE_OPTION_UNSUPPORTED"
    });
    expect(vi.mocked(runNodeReset)).not.toHaveBeenCalled();
    expect(fs.readdirSync(target)).toEqual(["hardkas.config.ts"]);
    expect(fs.readdirSync(here)).toEqual([]);
  });

  it("a command that takes its workspace from the invocation root accepts it", async () => {
    const program = buildHardkasProgram();
    program.exitOverride();
    // no telemetry stream in that workspace: "No anomalies recorded", and nothing is written
    await expect(program.parseAsync(["telemetry", "verify", "--workspace", dir], { from: "user" })).resolves.toBeDefined();
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
