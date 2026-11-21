import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Command } from "commander";
import { registerDevCommands } from "../src/commands/dev.js";
import { createCommandOutput, setGlobalOutput } from "../src/output.js";

vi.setConfig({ testTimeout: 60_000 });

// BETA-FIX W1 · `hardkas dev recover-lock --pid <pid>`: the dev server's SEND_GUARD_LOCK_STALE refusal named a function
// (recoverStaleSendGuardLock) a packaged user could not reach — no export, no command — so a dev server killed on
// Windows (Stop-Process, a closed window) left every later dev server unable to send. The command archives the stale
// lock (evidence kept) with the same refusals as the function: no/unreadable lock, another pid, a live owner.

// the dev server's modules (imported by the command, when it runs) resolve their workspace from HARDKAS_ROOT: a temporary
// one, never the repository's .hardkas
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w1-recover-iso-"));
const previousRoot = process.env.HARDKAS_ROOT;
process.env.HARDKAS_ROOT = isolated;
afterAll(() => {
  if (previousRoot === undefined) delete process.env.HARDKAS_ROOT;
  else process.env.HARDKAS_ROOT = previousRoot;
  fs.rmSync(isolated, { recursive: true, force: true });
});

const program = () => {
  const p = new Command();
  p.exitOverride();
  registerDevCommands(p);
  return p;
};

/** A pid that is certainly not running: a child that already exited. */
async function deadPid(): Promise<number> {
  const c = spawn(process.execPath, ["-e", "0"], { stdio: "ignore" });
  await new Promise<void>((r) => c.once("exit", () => r()));
  return c.pid!;
}

describe("hardkas dev recover-lock", () => {
  let root: string;
  let stdout: string;
  const lockFile = () => path.join(fs.realpathSync.native(root), ".hardkas", "dev-server", "send-guard.v1.lock");
  const writeLock = (content: Record<string, unknown>) => {
    fs.mkdirSync(path.dirname(lockFile()), { recursive: true });
    fs.writeFileSync(lockFile(), JSON.stringify(content));
  };
  const run = (args: string[], mode: "json" | "human" = "json") => {
    setGlobalOutput(createCommandOutput({ mode, stdout: { write: (m: string) => void (stdout += m) } as any }));
    return program().parseAsync(["dev", "recover-lock", ...args, ...(mode === "json" ? ["--json"] : [])], { from: "user" });
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w1-recover-"));
    fs.writeFileSync(path.join(root, "hardkas.config.ts"), "export default {};");
    stdout = "";
    vi.spyOn(process, "cwd").mockReturnValue(root);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setGlobalOutput(createCommandOutput({ mode: "human" }));
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("a stale lock (its process gone): archived, never deleted; --json says where", async () => {
    const pid = await deadPid();
    writeLock({ pid, nonce: "n", at: "2026-11-21T00:00:00.000Z" });
    await run(["--pid", String(pid)]);
    const out = JSON.parse(stdout);
    expect(out).toMatchObject({ schema: "hardkas.devServerLockRecovery.v1", ok: true, status: "archived", pid });
    expect(path.resolve(out.lock)).toBe(path.resolve(lockFile()));
    expect(fs.existsSync(lockFile())).toBe(false);
    expect(JSON.parse(fs.readFileSync(out.archived, "utf8"))).toMatchObject({ pid, nonce: "n" });
    expect(path.basename(out.archived)).toMatch(new RegExp(`^send-guard\\.v1\\.lock\\.stale-${pid}-`));
  });

  it("human output names the archive and says the log is untouched", async () => {
    const pid = await deadPid();
    writeLock({ pid });
    await run(["--pid", String(pid)], "human");
    expect(stdout).toMatch(/archived \(kept as evidence\)/);
    expect(stdout).toMatch(/send-guard log is untouched/);
  });

  it("refused, nothing changed: a live owner (exit 3), another pid (exit 2), no lock (exit 1)", async () => {
    writeLock({ pid: process.pid });
    await expect(run(["--pid", String(process.pid)])).rejects.toMatchObject({ code: "SEND_GUARD_LOCK_OWNER_ALIVE", exitCode: 3 });
    expect(JSON.parse(fs.readFileSync(lockFile(), "utf8")).pid).toBe(process.pid);
    await expect(run(["--pid", String(process.pid + 1)])).rejects.toMatchObject({ code: "SEND_GUARD_LOCK_PID_MISMATCH", exitCode: 2 });
    expect(JSON.parse(fs.readFileSync(lockFile(), "utf8")).pid).toBe(process.pid);
    fs.rmSync(lockFile());
    await expect(run(["--pid", "4242"])).rejects.toMatchObject({ code: "SEND_GUARD_LOCK_UNREADABLE", exitCode: 1 });
    expect(fs.readdirSync(path.dirname(lockFile()))).toEqual([]);
  });

  it("--pid is required and must be a positive whole number", async () => {
    await expect(run([])).rejects.toMatchObject({ code: "commander.missingMandatoryOptionValue" });
    for (const bad of ["abc", "0", "1.5", "--pid=-5"]) {
      const args = bad.startsWith("--") ? [bad] : ["--pid", bad];
      await expect(run(args), bad).rejects.toMatchObject({ code: "DEV_RECOVER_LOCK_PID_INVALID", exitCode: 2 });
    }
  });
});
