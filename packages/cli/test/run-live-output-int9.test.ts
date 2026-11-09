import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 120_000 });

// INT9 (B6 review M-5): `hardkas run` ran the script with spawnSync and printed its stderr only once it exited, so a script
// that warns or asks on stderr looked hung; and the child's piped output was capped by maxBuffer (64 MiB), so a script
// that printed more failed with ENOBUFS (SCRIPT_EXECUTION_FAILED) although it succeeded. Now the stderr (and, with
// --json, the stdout sent to stderr) is passed on as it is written, with no cap, and a failure keeps its typed cause
// (H3, run-typed-errors-h3). Offline (the simulator, no harness): loopback only, nothing contacted.

let ws = "";
const MIB = 1024 * 1024;

beforeAll(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-run-live-"));
  // writes a marker on stderr, then waits (up to 20 s) for the test to answer by creating release.flag
  fs.writeFileSync(
    path.join(ws, "ask.ts"),
    [
      'import fs from "node:fs";',
      'process.stderr.write("HK-LIVE-MARK: waiting for an answer\\n");',
      "const until = Date.now() + 20_000;",
      "const poll = () => {",
      '  if (fs.existsSync("release.flag")) { process.stderr.write("released\\n"); return; }',
      '  if (Date.now() > until) { process.stderr.write("no answer: the marker was not seen while I ran\\n"); process.exit(3); }',
      "  setTimeout(poll, 50);",
      "};",
      "poll();"
    ].join("\n")
  );
  const flood = (stream: "stdout" | "stderr") =>
    [`const chunk = "x".repeat(${MIB - 1}) + "\\n";`, `for (let i = 0; i < 70; i++) process.${stream}.write(chunk);`, `process.${stream}.write("FLOOD-END\\n");`].join("\n");
  fs.writeFileSync(path.join(ws, "flood-stdout.ts"), flood("stdout"));
  fs.writeFileSync(path.join(ws, "flood-stderr.ts"), flood("stderr"));
});

afterAll(() => {
  if (ws) fs.rmSync(ws, { recursive: true, force: true });
});

/** The built CLI in its own process; stderr is watched as it arrives and counted, never accumulated whole. */
function runCli(args: string[], onStderr?: (text: string) => void) {
  return new Promise<{ status: number | null; stdout: string; stderrBytes: number; stderrHead: string; stderrTail: string; markBeforeExit: boolean }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, "run", ...args], { cwd: ws, env: childEnv(), windowsHide: true });
    let stdout = "";
    let stderrBytes = 0;
    let head = "";
    let tail = "";
    let exited = false;
    let markBeforeExit = false;
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d: Buffer) => {
      stderrBytes += d.length;
      const s = d.toString("utf8");
      if (head.length < 4096) head += s.slice(0, 4096 - head.length);
      tail = (tail + s).slice(-4096);
      if (!exited && /HK-LIVE-MARK/.test(s)) markBeforeExit = true;
      onStderr?.(s);
    });
    child.on("exit", () => (exited = true));
    child.on("close", (status) => resolve({ status, stdout, stderrBytes, stderrHead: head, stderrTail: tail, markBeforeExit }));
  });
}

describe("INT9 · `hardkas run` passes the script's output on live, with no output limit", () => {
  it("RL-1 the script's stderr arrives while it runs: a script that asks on stderr gets its answer and finishes (it no longer looks hung)", async () => {
    fs.rmSync(path.join(ws, "release.flag"), { force: true });
    let answered = false;
    const r = await runCli(["ask.ts", "--network", "simulated", "--no-harness"], (s) => {
      if (!answered && /HK-LIVE-MARK/.test(s)) {
        answered = true;
        fs.writeFileSync(path.join(ws, "release.flag"), "go");
      }
    });
    const brief = `exit ${r.status}\n${r.stdout.slice(0, 800)}\n${r.stderrHead}\n…\n${r.stderrTail}`;
    expect(r.markBeforeExit, brief).toBe(true);
    expect(r.status, brief).toBe(0);
    expect(r.stderrTail, brief).toMatch(/released/);
  });

  it("RL-2 more than 64 MiB on stdout under --json (sent to stderr): exit 0, one ok envelope, every byte passed on", async () => {
    const r = await runCli(["flood-stdout.ts", "--network", "simulated", "--no-harness", "--json"]);
    const brief = `exit ${r.status}\nstdout: ${r.stdout.slice(0, 800)}\nstderr bytes ${r.stderrBytes}\n${r.stderrTail.slice(-600)}`;
    expect(r.status, brief).toBe(0);
    const docs = r.stdout.trim().split(/\r?\n(?=\{)/).map((c) => JSON.parse(c));
    expect(docs, brief).toHaveLength(1);
    expect(docs[0], brief).toMatchObject({ ok: true, command: "run" });
    expect(r.stderrBytes, brief).toBeGreaterThanOrEqual(70 * MIB);
    expect(r.stderrTail, brief).toMatch(/FLOOD-END/);
  });

  it("RL-3 more than 64 MiB on stderr: exit 0, every byte passed on", async () => {
    const r = await runCli(["flood-stderr.ts", "--network", "simulated", "--no-harness"]);
    const brief = `exit ${r.status}\nstdout: ${r.stdout.slice(0, 800)}\nstderr bytes ${r.stderrBytes}\n${r.stderrTail.slice(-600)}`;
    expect(r.status, brief).toBe(0);
    expect(r.stderrBytes, brief).toBeGreaterThanOrEqual(70 * MIB);
    expect(r.stderrTail, brief).toMatch(/FLOOD-END/);
  });
});
