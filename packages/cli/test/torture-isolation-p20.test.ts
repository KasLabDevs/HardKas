/**
 * ESCALÓN 3 · P20 — `torture matrix` and `torture replay` ran their cases in the current directory: the matrix deleted
 * ./.hardkas/telemetry/telemetry.jsonl first and the buckets pre-cleaned ./.tmp/<case dirs>, whatever they held. The
 * cases now run in a directory the run creates under the OS temp dir and deletes afterwards; the current directory is
 * only read (sourceRoot), appended to (the telemetry stream) and given the report. The buckets are replaced here by one
 * that writes where the real local bucket pre-cleans (`.tmp/local-<caseId>`), so the test needs no node and no network.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const seen = vi.hoisted(() => ({ ctx: [] as any[] }));

vi.mock("@hardkas/testing", async (importOriginal) => {
  const actual: any = await importOriginal();
  const nodeFs = await import("node:fs");
  const nodePath = await import("node:path");
  const bucket = {
    name: "e3-local-dir",
    expectedInvariant: "the case writes only in its own workspace",
    async run(ctx: any) {
      seen.ctx.push({ ...ctx, prng: undefined });
      const dir = nodePath.join(ctx.workspaceDir, ".tmp", `local-${ctx.caseId}`);
      nodeFs.rmSync(dir, { recursive: true, force: true }); // what the real local bucket does first
      nodeFs.mkdirSync(dir, { recursive: true });
      nodeFs.writeFileSync(nodePath.join(dir, "case.txt"), ctx.caseId);
      return { flow: "write in the workspace", mutation: "none" };
    }
  };
  return { ...actual, getAllTortureBuckets: () => [bucket] };
});

const { runTortureMatrix, runTortureReplay } = await import("../src/runners/torture-runner.js");

let project: string;
let startedIn: string;
const OLD_TELEMETRY = '{"schemaVersion":"hardkas.telemetry.v1","type":"USER_EVENT","note":"written before the matrix"}\n';

beforeEach(() => {
  seen.ctx.length = 0;
  startedIn = process.cwd();
  project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-e3-torture-")));
  fs.mkdirSync(path.join(project, ".hardkas", "telemetry"), { recursive: true });
  fs.writeFileSync(path.join(project, ".hardkas", "telemetry", "telemetry.jsonl"), OLD_TELEMETRY);
  fs.mkdirSync(path.join(project, ".tmp", "local-case-001"), { recursive: true });
  fs.writeFileSync(path.join(project, ".tmp", "local-case-001", "keep.txt"), "the user's file");
  process.chdir(project);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  process.chdir(startedIn);
  vi.restoreAllMocks();
  fs.rmSync(project, { recursive: true, force: true });
});

describe("ESCALÓN 3 · P20 · torture never deletes in the current directory", () => {
  it("matrix: the cases run in a temp dir of its own, deleted afterwards; the workspace keeps its files and telemetry", async () => {
    await runTortureMatrix({ iterations: 3, seed: 5 });

    expect(seen.ctx.length).toBe(3);
    const runDirs = new Set(seen.ctx.map((c) => c.workspaceDir));
    expect(runDirs.size).toBe(1);
    const [runDir] = [...runDirs] as string[];
    expect(runDir).not.toBe(project);
    expect(path.basename(runDir!)).toMatch(/^hardkas-torture-/);
    expect(path.dirname(runDir!)).toBe(path.resolve(os.tmpdir()));
    expect(fs.existsSync(runDir!), "the run deletes the directory it created").toBe(false);
    expect(seen.ctx.every((c) => c.sourceRoot === project)).toBe(true);

    // the user's .tmp/local-case-001 is where the bucket pre-cleans: it is untouched
    expect(fs.readFileSync(path.join(project, ".tmp", "local-case-001", "keep.txt"), "utf8")).toBe("the user's file");
    // the telemetry stream is appended to, never cleared
    const telemetry = fs.readFileSync(path.join(project, ".hardkas", "telemetry", "telemetry.jsonl"), "utf8");
    expect(telemetry.startsWith(OLD_TELEMETRY)).toBe(true);
    expect(telemetry.length).toBeGreaterThan(OLD_TELEMETRY.length);
    // the report is still written where CI uploads it from
    const report = JSON.parse(fs.readFileSync(path.join(project, ".hardkas", "reports", "torture-5.json"), "utf8"));
    expect(report.summary).toMatchObject({ total: 3, passed: 3, failed: 0 });
  });

  it("replay: the case runs in a temp dir of its own, deleted afterwards", async () => {
    await runTortureReplay({ seed: 5, caseId: "case-001" });
    expect(seen.ctx.length).toBe(1);
    expect(seen.ctx[0].workspaceDir).not.toBe(project);
    expect(path.basename(seen.ctx[0].workspaceDir)).toMatch(/^hardkas-torture-/);
    expect(fs.existsSync(seen.ctx[0].workspaceDir)).toBe(false);
    expect(fs.readFileSync(path.join(project, ".tmp", "local-case-001", "keep.txt"), "utf8")).toBe("the user's file");
  });
});
