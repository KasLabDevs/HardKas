// L1-CORE-1 B4 · lock status [name]: run in a workspace whose .hardkas/locks holds lock records in the format
// @hardkas/core writes them, for a live holder (this test process), a dead one (a process that already exited) and
// one on another host. The command has no --json; its exit code and what it says of each lock are asserted, and that
// it only reads (the lock files are unchanged).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cli, simulatedWorkspace, removeDir, snapshotFiles } from "./helpers/l1-core-1-b4.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

describe("lock status [name]", () => {
  let parent: string;
  let ws: string;
  let locks: string;
  let deadPid: number;

  const writeLock = (name: string, pid: number, hostname: string | undefined, command: string) =>
    fs.writeFileSync(
      path.join(locks, `${name}.lock`),
      JSON.stringify({ schema: "hardkas.lock.v1", name, pid, command, cwd: ws, ...(hostname ? { hostname } : {}), createdAt: new Date().toISOString(), expiresAt: null }, null, 2)
    );

  beforeAll(() => {
    ({ parent, ws } = simulatedWorkspace("hk-b4-lock-status-"));
    locks = path.join(ws, ".hardkas", "locks");
    fs.mkdirSync(locks, { recursive: true });
    for (const f of fs.readdirSync(locks)) if (f.endsWith(".lock")) throw new Error(`unexpected lock left by init: ${f}`);
    const exited = spawnSync(process.execPath, ["-e", ""]);
    deadPid = exited.pid!;
  });
  afterAll(() => removeDir(parent));

  it("no lock held: the summary says every lock is FREE, and a named lock is FREE, exit 0", () => {
    const all = cli(["lock", "status"], ws);
    expect(all.status, all.all.slice(0, 600)).toBe(0);
    expect(all.stdout).toMatch(/All locks are FREE/);
    const one = cli(["lock", "status", "workspace"], ws);
    expect(one.status).toBe(0);
    expect(one.stdout).toMatch(/Lock 'workspace' is FREE/);
  });

  it("held locks: live (this process, this host), stale (an exited process, this host), unverifiable (another host)", () => {
    writeLock("workspace", process.pid, os.hostname(), "l1-core-1 b4 live holder");
    writeLock("accounts", deadPid, os.hostname(), "l1-core-1 b4 dead holder");
    writeLock("artifacts", 4242, "b4-elsewhere.invalid", "l1-core-1 b4 remote holder");
    const before = snapshotFiles(locks);

    const live = cli(["lock", "status", "workspace"], ws);
    expect(live.status, live.all.slice(0, 600)).toBe(0);
    expect(live.stdout).toMatch(/State:\s+HELD \(live\)/);
    expect(live.stdout).toContain(`PID:     ${process.pid}`);
    expect(live.stdout).toContain(`Host:    ${os.hostname()}`);
    expect(live.stdout).toContain("Command: l1-core-1 b4 live holder");
    expect(live.stdout).toContain(`Path:    ${path.join(locks, "workspace.lock")}`);
    expect(live.stdout).not.toMatch(/Why:/);

    const stale = cli(["lock", "status", "accounts"], ws);
    expect(stale.status).toBe(0);
    expect(stale.stdout).toMatch(/State:\s+HELD \(STALE\)/);
    expect(stale.stdout).toMatch(new RegExp(`Why:\\s+process ${deadPid} is not running on this host`));

    const remote = cli(["lock", "status", "artifacts"], ws);
    expect(remote.status).toBe(0);
    expect(remote.stdout).toMatch(/State:\s+HELD \(UNVERIFIABLE\)/);
    expect(remote.stdout).toMatch(/Why:\s+held on another host \(b4-elsewhere\.invalid\)/);

    const summary = cli(["lock", "status"], ws);
    expect(summary.status).toBe(0);
    expect(summary.stdout).toMatch(/workspace\s*: HELD \(live\)/);
    expect(summary.stdout).toMatch(/accounts\s*: HELD \(STALE\)/);
    expect(summary.stdout).toMatch(/artifacts\s*: HELD \(UNVERIFIABLE\)/);
    expect(summary.stdout).not.toMatch(/All locks are FREE/);

    // status only reads: every lock file is byte-identical
    expect(snapshotFiles(locks)).toEqual(before);
  });
});
