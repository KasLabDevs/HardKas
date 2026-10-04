import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { acquireLock, withLock, withLocks, LOCK_ORDER } from "../src/lock.js";

vi.setConfig({ testTimeout: 120_000 });

// ARTIFACT-LOCK-REENTRANCY-1 (phase 1 of SNAPSHOT-CREATE-CONCURRENCY-1). Today a second acquisition of a lock this
// process already holds fails (its own live PID makes it LOCK_HELD), so no write path can take `artifacts` from inside a
// command that already holds it. Contract:
//   - a holding is one lock file (workspace/.hardkas/locks/<name>.lock, canonical path) held by this process; its handles
//     are shares of it;
//   - nesting is the call chain: an acquisition made inside a holding (inside withLock/withLocks of that lock, including
//     everything it awaits or calls) joins it at once and writes nothing; anything outside it — another process, or an
//     independent concurrent operation of this same process — is excluded exactly as before;
//   - each handle releases its share once (a repeated release is a no-op); the file goes when the last share is
//     released, in whatever order, and only if it is still exactly the file this holding wrote;
//   - a join first checks the file is still this holding's; removed or replaced from outside → LOCK_LOST;
//   - unchanged: the file format, stale recovery, a file with our PID that is not a live holding (LOCK_HELD), LOCK_ORDER.
// "Another process" is a real child process running the same lock source (tsx).

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const lockSource = pathToFileURL(fileURLToPath(new URL("../src/lock.ts", import.meta.url))).href;
let childScript: string;
let root: string;
let root2: string;

beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-lock-child-"));
  childScript = path.join(dir, "try-lock.mts");
  fs.writeFileSync(
    childScript,
    `const [, , src, rootDir, name] = process.argv;
const { acquireLock } = await import(src);
try {
  const h = await acquireLock({ rootDir, name, command: "other process" });
  await h.release();
  console.log("RESULT acquired");
} catch (e) {
  console.log("RESULT " + (e?.code ?? e?.message));
}
`
  );
});
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-lock-reentrancy-"));
  root2 = fs.mkdtempSync(path.join(os.tmpdir(), "hk-lock-reentrancy-b-"));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(root2, { recursive: true, force: true });
});

const lockFile = (r: string, name = "artifacts") => path.join(r, ".hardkas", "locks", `${name}.lock`);
/** A real second process tries to take the lock (no wait): "acquired" or the error code it got. */
function otherProcessTries(r: string, name = "artifacts"): string {
  const res = spawnSync(process.execPath, ["--import", "tsx", childScript, lockSource, r, name], { cwd: repoRoot, encoding: "utf-8", timeout: 60_000 });
  const line = (res.stdout ?? "").split(/\r?\n/).find((l) => l.startsWith("RESULT "));
  if (!line) throw new Error(`child gave no result (exit ${res.status}): ${res.stderr}`);
  return line.slice("RESULT ".length);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("ARTIFACT-LOCK-REENTRANCY-1 · nested acquisitions join the holding", () => {
  it("inside withLock, the same lock is taken again at once: nested withLock and a bare acquireLock", async () => {
    await withLock({ rootDir: root, name: "artifacts" }, async () => {
      const inner = await withLock({ rootDir: root, name: "artifacts" }, async () => "nested ran");
      expect(inner).toBe("nested ran");
      const h = await acquireLock({ rootDir: root, name: "artifacts" });
      await h.release();
    });
    expect(fs.existsSync(lockFile(root))).toBe(false);
  });

  it("outer acquire → inner acquire → inner release → outer release: only the outer release lets another process in", async () => {
    await withLock({ rootDir: root, name: "artifacts" }, async () => {
      const inner = await acquireLock({ rootDir: root, name: "artifacts" });
      await inner.release();
      expect(fs.existsSync(lockFile(root)), "the inner release must not remove the file").toBe(true);
      expect(otherProcessTries(root)).toBe("LOCK_HELD");
    });
    expect(otherProcessTries(root)).toBe("acquired");
  });

  it("release order does not matter: the outer share ends first, the lock stays until the inner share is released", async () => {
    let inner: Awaited<ReturnType<typeof acquireLock>> | undefined;
    await withLock({ rootDir: root, name: "artifacts" }, async () => {
      inner = await acquireLock({ rootDir: root, name: "artifacts" });
    });
    expect(fs.existsSync(lockFile(root))).toBe(true);
    expect(otherProcessTries(root)).toBe("LOCK_HELD");
    await inner!.release();
    expect(otherProcessTries(root)).toBe("acquired");
  });

  it("a repeated release of the same handle is a no-op: it never drops another share", async () => {
    await withLock({ rootDir: root, name: "artifacts" }, async () => {
      const inner = await acquireLock({ rootDir: root, name: "artifacts" });
      await inner.release();
      await inner.release();
      expect(otherProcessTries(root)).toBe("LOCK_HELD");
    });
    expect(otherProcessTries(root)).toBe("acquired");
  });

  it("a handle of an ended holding never removes a later holding of the same lock", async () => {
    const first = await acquireLock({ rootDir: root, name: "artifacts" });
    await first.release();
    const second = await acquireLock({ rootDir: root, name: "artifacts" });
    await first.release(); // stale handle
    expect(fs.existsSync(lockFile(root))).toBe(true);
    expect(otherProcessTries(root)).toBe("LOCK_HELD");
    await second.release();
    expect(fs.existsSync(lockFile(root))).toBe(false);
  });

  it("an exception inside a nested withLock releases only the nested share", async () => {
    await withLock({ rootDir: root, name: "artifacts" }, async () => {
      await expect(
        withLock({ rootDir: root, name: "artifacts" }, async () => {
          throw new Error("boom inside");
        })
      ).rejects.toThrow("boom inside");
      expect(otherProcessTries(root)).toBe("LOCK_HELD");
    });
    expect(otherProcessTries(root)).toBe("acquired");
    // and when nobody catches it, the error crosses both levels and both shares are released
    await expect(
      withLock({ rootDir: root, name: "artifacts" }, () => withLock({ rootDir: root, name: "artifacts" }, async () => { throw new Error("boom through"); }))
    ).rejects.toThrow("boom through");
    expect(fs.existsSync(lockFile(root))).toBe(false);
  });

  it("withLocks also opens a holding: a nested acquisition of one of its locks joins", async () => {
    await withLocks(root, ["query-store", "artifacts"], async () => {
      const h = await acquireLock({ rootDir: root, name: "artifacts" });
      await h.release();
      expect(otherProcessTries(root)).toBe("LOCK_HELD");
    });
    expect(otherProcessTries(root)).toBe("acquired");
  });

  it("a nested acquisition through another copy of the lock module in this process joins the same holding", async () => {
    vi.resetModules();
    const copy = await import("../src/lock.js");
    await withLock({ rootDir: root, name: "artifacts" }, async () => {
      const h = await copy.acquireLock({ rootDir: root, name: "artifacts" });
      await h.release();
      expect(otherProcessTries(root)).toBe("LOCK_HELD");
    });
    expect(otherProcessTries(root)).toBe("acquired");
  });

  it("a holding removed or replaced from outside is never joined: LOCK_LOST", async () => {
    await withLock({ rootDir: root, name: "artifacts" }, async () => {
      fs.unlinkSync(lockFile(root));
      await expect(acquireLock({ rootDir: root, name: "artifacts" })).rejects.toMatchObject({ code: "LOCK_LOST" });
    });
    await withLock({ rootDir: root, name: "artifacts" }, async () => {
      fs.writeFileSync(lockFile(root), JSON.stringify({ schema: "hardkas.lock.v1", name: "artifacts", pid: process.ppid, hostname: os.hostname() }));
      await expect(acquireLock({ rootDir: root, name: "artifacts" })).rejects.toMatchObject({ code: "LOCK_LOST" });
    });
    // the replaced file is not ours: the outer release left it alone
    expect(JSON.parse(fs.readFileSync(lockFile(root), "utf-8")).pid).toBe(process.ppid);
  });
});

describe("ARTIFACT-LOCK-REENTRANCY-1 · what must not change", () => {
  it("two independent concurrent operations of this process still exclude each other", async () => {
    const events: string[] = [];
    const op = (tag: string) =>
      withLock({ rootDir: root, name: "artifacts", wait: true, timeoutMs: 20_000, pollMs: 20 }, async () => {
        events.push(`${tag}:in`);
        await sleep(200);
        events.push(`${tag}:out`);
      });
    await Promise.all([op("A"), op("B")]);
    expect(events).toEqual(["A:in", "A:out", "B:in", "B:out"]);
  });

  it("a bare second acquisition outside any holding is an independent operation: LOCK_HELD, as before", async () => {
    const h = await acquireLock({ rootDir: root, name: "artifacts" });
    await expect(acquireLock({ rootDir: root, name: "artifacts" })).rejects.toMatchObject({ code: "LOCK_HELD" });
    await h.release();
  });

  it("two workspaces never share a holding", async () => {
    const other = foreignHolder(root2);
    try {
      await withLock({ rootDir: root, name: "artifacts" }, async () => {
        await expect(acquireLock({ rootDir: root2, name: "artifacts" })).rejects.toMatchObject({ code: "LOCK_HELD" });
      });
    } finally {
      fs.unlinkSync(lockFile(root2)); // the simulated foreign holder goes away
      other();
    }
    await withLock({ rootDir: root, name: "artifacts" }, async () => {
      const h = await acquireLock({ rootDir: root2, name: "artifacts" });
      expect(fs.existsSync(lockFile(root2))).toBe(true);
      await h.release();
      expect(fs.existsSync(lockFile(root2)), "a share of another workspace's lock is its own holding").toBe(false);
      expect(fs.existsSync(lockFile(root))).toBe(true);
    });
  });

  it("two lock names never share a holding", async () => {
    const other = foreignHolder(root, "query-store");
    try {
      await withLock({ rootDir: root, name: "artifacts" }, async () => {
        await expect(acquireLock({ rootDir: root, name: "query-store" })).rejects.toMatchObject({ code: "LOCK_HELD" });
      });
    } finally {
      fs.unlinkSync(lockFile(root, "query-store"));
      other();
    }
  });

  it("a lock file carrying this process's PID that is not a live holding is not joined (LOCK_HELD)", async () => {
    fs.mkdirSync(path.dirname(lockFile(root)), { recursive: true });
    fs.writeFileSync(lockFile(root), JSON.stringify({ schema: "hardkas.lock.v1", name: "artifacts", pid: process.pid, command: "left behind", cwd: root, hostname: os.hostname(), createdAt: new Date().toISOString(), expiresAt: null }));
    await expect(acquireLock({ rootDir: root, name: "artifacts" })).rejects.toMatchObject({ code: "LOCK_HELD" });
  });

  it("stale recovery is unchanged, also from inside a holding of another lock", async () => {
    fs.mkdirSync(path.dirname(lockFile(root)), { recursive: true });
    fs.writeFileSync(lockFile(root, "query-store"), JSON.stringify({ schema: "hardkas.lock.v1", name: "query-store", pid: 999999, command: "dead", cwd: root, hostname: os.hostname(), createdAt: new Date().toISOString(), expiresAt: null }));
    await withLock({ rootDir: root, name: "artifacts" }, async () => {
      const h = await acquireLock({ rootDir: root, name: "query-store" });
      expect(h.metadata.pid).toBe(process.pid);
      await h.release();
    });
  });

  it("LOCK_ORDER: phase 1 left it unchanged; phase 2B adds simulator-state before artifacts", () => {
    // SIMULATOR-EXECUTION-UNIT-1: a simulated execution holds simulator-state and takes artifacts inside it for its writes
    expect(LOCK_ORDER).toEqual(["workspace", "node", "accounts", "simulator-state", "artifacts", "events", "pending-spends", "query-store"]);
  });
});

/** A foreign live holder: a lock file naming the parent process (alive, not this process). Returns a no-op disposer. */
function foreignHolder(r: string, name = "artifacts"): () => void {
  fs.mkdirSync(path.dirname(lockFile(r, name)), { recursive: true });
  fs.writeFileSync(lockFile(r, name), JSON.stringify({ schema: "hardkas.lock.v1", name, pid: process.ppid, command: "foreign holder", cwd: r, hostname: os.hostname(), createdAt: new Date().toISOString(), expiresAt: null }));
  return () => {};
}
