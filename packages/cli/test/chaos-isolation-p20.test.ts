/**
 * ESCALÓN 3 · P20 — `hardkas chaos` deleted ./.hardkas-chaos and ./.hardkas-chaos-workspace in the current directory
 * without asking, whatever they held. The real CLI now runs the campaign in a directory it creates under the OS temp dir
 * (here a temp root of the test's own, via TEMP/TMP) and deletes only its own workspace there. The current-directory
 * flags change nothing and say so (OPTION_NO_EFFECT). HumanChaos is the actor: it only runs an unknown command.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";

let project: string;
let tempRoot: string;
let home: string;

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-e3-chaos-project-"));
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-e3-chaos-tmp-"));
  home = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-e3-chaos-home-"));
  for (const d of [".hardkas-chaos", ".hardkas-chaos-workspace"]) {
    fs.mkdirSync(path.join(project, d), { recursive: true });
    fs.writeFileSync(path.join(project, d, "keep.txt"), `the user's ${d}`);
  }
});

afterEach(() => {
  for (const d of [project, tempRoot, home]) fs.rmSync(d, { recursive: true, force: true });
});

function chaos(args: string[]) {
  const r = spawnSync(process.execPath, [cliDist, "chaos", ...args], {
    cwd: project,
    encoding: "utf8",
    env: childEnv({ TEMP: tempRoot, TMP: tempRoot, TMPDIR: tempRoot, HARDKAS_HOME: home }),
    timeout: 120_000
  });
  return { status: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

describe("ESCALÓN 3 · P20 · chaos never deletes in the current directory", () => {
  it("a campaign leaves ./.hardkas-chaos and ./.hardkas-chaos-workspace untouched and reports in its own temp dir", () => {
    const r = chaos(["--runs", "1", "--actor", "HumanChaos", "--unsafe-current-dir"]);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain("OPTION_NO_EFFECT");

    for (const d of [".hardkas-chaos", ".hardkas-chaos-workspace"]) {
      expect(fs.readFileSync(path.join(project, d, "keep.txt"), "utf8")).toBe(`the user's ${d}`);
      expect(fs.readdirSync(path.join(project, d))).toEqual(["keep.txt"]);
    }

    const runs = fs.readdirSync(tempRoot).filter((n) => n.startsWith("hardkas-chaos-"));
    expect(runs.length).toBe(1);
    const runDir = path.join(tempRoot, runs[0]!);
    expect(fs.existsSync(path.join(runDir, "reports", "chaos-report.json"))).toBe(true);
    expect(fs.existsSync(path.join(runDir, "workspace")), "the run deletes the workspace it created").toBe(false);
    expect(r.out).toContain(path.join(runDir, "reports"));
  });

  it("a replay runs in a temp dir of its own and leaves nothing behind", () => {
    const r = chaos(["replay", "--run-seed", "3"]);
    expect([0, 2], r.out).toContain(r.status);
    for (const d of [".hardkas-chaos", ".hardkas-chaos-workspace"]) {
      expect(fs.readdirSync(path.join(project, d))).toEqual(["keep.txt"]);
    }
    expect(fs.readdirSync(tempRoot).filter((n) => n.startsWith("hardkas-chaos-"))).toEqual([]);
  });
});
