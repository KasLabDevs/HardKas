// ESCALÓN 2 · P14 · `lock clear <name>`: an operation that clears nothing never exits 0. A declined confirmation and
// stdin that ends before an answer (EOF) used to return with exit 0 and the lock in place; they now fail with
// LOCK_CLEAR_NOT_CONFIRMED (exit 1) and say nothing was removed. A clear that fails (--if-dead on a live holder) keeps
// its LOCK_CLEAR_FAILED; --yes still clears. Built CLI, a temporary workspace, lock records in @hardkas/core's format.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cli, simulatedWorkspace, removeDir } from "./helpers/l1-core-1-b4.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

describe("ESCALÓN 2 · P14 · lock clear exits nonzero when it clears nothing", () => {
  let parent: string;
  let ws: string;
  let locks: string;
  let deadPid: number;

  const writeLock = (name: string, pid: number) =>
    fs.writeFileSync(
      path.join(locks, `${name}.lock`),
      JSON.stringify(
        { schema: "hardkas.lock.v1", name, pid, command: "p14 holder", cwd: ws, hostname: os.hostname(), createdAt: new Date().toISOString(), expiresAt: null },
        null,
        2
      )
    );

  beforeAll(() => {
    ({ parent, ws } = simulatedWorkspace("hk-p14-lock-clear-"));
    locks = path.join(ws, ".hardkas", "locks");
    fs.mkdirSync(locks, { recursive: true });
    deadPid = spawnSync(process.execPath, ["-e", ""]).pid!;
  });
  afterAll(() => removeDir(parent));

  it("a declined confirmation ('n'): exit 1, LOCK_CLEAR_NOT_CONFIRMED, the lock is still there", () => {
    writeLock("accounts", deadPid);
    const r = cli(["lock", "clear", "accounts", "--if-dead"], ws, { input: "n\n" });
    expect(r.status, r.all.slice(0, 800)).toBe(1);
    expect(r.stderr).toMatch(/LOCK_CLEAR_NOT_CONFIRMED/);
    expect(r.stderr).toMatch(/Nothing was removed/);
    expect(fs.existsSync(path.join(locks, "accounts.lock"))).toBe(true);
  });

  it("stdin that ends before an answer (EOF): exit 1, LOCK_CLEAR_NOT_CONFIRMED, the lock is still there", () => {
    writeLock("accounts", deadPid);
    const r = cli(["lock", "clear", "accounts", "--if-dead"], ws, { input: "" });
    expect(r.status, r.all.slice(0, 800)).toBe(1);
    expect(r.stderr).toMatch(/LOCK_CLEAR_NOT_CONFIRMED/);
    expect(fs.existsSync(path.join(locks, "accounts.lock"))).toBe(true);
  });

  it("a clear that fails (--if-dead on a live holder): nonzero, LOCK_CLEAR_FAILED, the lock is still there", () => {
    writeLock("workspace", process.pid);
    const r = cli(["lock", "clear", "workspace", "--if-dead", "--yes"], ws);
    expect(r.status, r.all.slice(0, 800)).not.toBe(0);
    expect(r.stderr).toMatch(/LOCK_CLEAR_FAILED/);
    expect(fs.existsSync(path.join(locks, "workspace.lock"))).toBe(true);
  });

  it("control: a confirmed --if-dead clear of a dead holder ('y', or --yes) removes the lock and exits 0", () => {
    writeLock("accounts", deadPid);
    const y = cli(["lock", "clear", "accounts", "--if-dead"], ws, { input: "y\n" });
    expect(y.status, y.all.slice(0, 800)).toBe(0);
    expect(fs.existsSync(path.join(locks, "accounts.lock"))).toBe(false);
    writeLock("accounts", deadPid);
    const yes = cli(["lock", "clear", "accounts", "--if-dead", "--yes"], ws);
    expect(yes.status, yes.all.slice(0, 800)).toBe(0);
    expect(fs.existsSync(path.join(locks, "accounts.lock"))).toBe(false);
  });
});
