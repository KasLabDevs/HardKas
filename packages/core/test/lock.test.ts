import { describe, it, beforeEach, afterEach, expect, assert } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { acquireLock, withLock, withLocks, isProcessAlive, LOCK_ORDER } from "../src/lock.js";

describe("HardKAS Lock System", () => {
  const testRoot = path.join(os.tmpdir(), `hardkas-test-lock-${Math.random().toString(36).slice(2)}`);
  const lockDir = path.join(testRoot, ".hardkas", "locks");

  beforeEach(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(testRoot, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it("should acquire and release a lock", async () => {
    const handle = await acquireLock({ rootDir: testRoot, name: "test-lock" });
    const lockPath = path.join(lockDir, "test-lock.lock");
    
    expect(fs.existsSync(lockPath)).toBe(true);
    const meta = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    expect(meta.name).toBe("test-lock");
    expect(meta.pid).toBe(process.pid);

    await handle.release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("should fail to acquire an already held lock", async () => {
    const handle = await acquireLock({ rootDir: testRoot, name: "test-lock" });
    
    await expect(acquireLock({ rootDir: testRoot, name: "test-lock" }))
      .rejects.toThrow(/Workspace is locked/);

    await handle.release();
  });

  it("should wait for a lock if wait=true", async () => {
    const handle = await acquireLock({ rootDir: testRoot, name: "test-lock" });
    
    let acquired = false;
    const waitPromise = acquireLock({ rootDir: testRoot, name: "test-lock", wait: true, timeoutMs: 1000, pollMs: 100 })
      .then(h => { acquired = true; return h; });

    await new Promise(resolve => setTimeout(resolve, 300));
    expect(acquired).toBe(false);

    await handle.release();
    const secondHandle = await waitPromise;
    expect(acquired).toBe(true);
    await secondHandle.release();
  });

  it("should timeout if lock is not released", async () => {
    const handle = await acquireLock({ rootDir: testRoot, name: "test-lock" });
    
    try {
      await acquireLock({ rootDir: testRoot, name: "test-lock", wait: true, timeoutMs: 500, pollMs: 100 });
      assert.fail("Should have thrown LOCK_TIMEOUT");
    } catch (e: any) {
      expect(e.code).toBe("LOCK_TIMEOUT");
    }

    await handle.release();
  });

  it("should detect a stale lock (simulated)", async () => {
    const lockPath = path.join(lockDir, "stale.lock");
    fs.mkdirSync(lockDir, { recursive: true });
    
    // Create a lock with an impossible PID
    const staleMeta = {
      schema: "hardkas.lock.v1",
      name: "stale",
      pid: 999999,
      command: "old-command",
      cwd: process.cwd(),
      hostname: os.hostname(),
      createdAt: new Date().toISOString(),
      expiresAt: null
    };
    fs.writeFileSync(lockPath, JSON.stringify(staleMeta));

    try {
      await acquireLock({ rootDir: testRoot, name: "stale" });
      assert.fail("Should have thrown STALE_LOCK");
    } catch (e: any) {
      expect(e.code).toBe("STALE_LOCK");
    }
  });

  it("should release only if owned by current process", async () => {
    const handle = await acquireLock({ rootDir: testRoot, name: "test-lock" });
    const lockPath = path.join(lockDir, "test-lock.lock");

    const otherMeta = { ...handle.metadata, pid: 123 };
    fs.writeFileSync(lockPath, JSON.stringify(otherMeta));

    await handle.release();
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  it("withLock should release automatically", async () => {
    const lockPath = path.join(lockDir, "auto.lock");
    await withLock({ rootDir: testRoot, name: "auto" }, async () => {
      expect(fs.existsSync(lockPath)).toBe(true);
    });
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("isProcessAlive should work", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(999999)).toBe(false);
  });
});
