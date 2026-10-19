import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";

// P0-TX-SAFETY-INTEGRATION / LOCK-RACE-1 (owner review 2026-10-19). The send guard must have ONE effective owner per
// physical workspace, always:
//  - two processes recovering the same stale lock must never both end up owners (the check-pid → unlink → create
//    sequence lets the second recoverer delete the first one's FRESH lock);
//  - two paths to the same physical workspace (a junction / symlink) must not get two guards;
//  - a stale lock is never removed automatically: sends are refused until a controlled recovery archives it (evidence
//    kept); an owner that loses its lock stops sending.

// node:fs with a hook on unlinkSync, to interleave a concurrent recoverer exactly between "read stale pid" and "unlink"
const hooks = vi.hoisted(() => ({ beforeUnlink: undefined as undefined | ((p: string) => void) }));
vi.mock("node:fs", async (importOriginal) => {
  const actual: any = await importOriginal();
  const patched = {
    ...actual,
    unlinkSync: (p: any) => {
      hooks.beforeUnlink?.(String(p));
      return actual.unlinkSync(p);
    }
  };
  return { ...patched, default: patched };
});

const node = vi.hoisted(() => ({ cwd: "", network: "testnet-10" as string, plans: 0, broadcasts: [] as string[], hang: false, release: undefined as undefined | (() => void) }));
vi.mock("@hardkas/sdk", () => ({
  Hardkas: {
    create: vi.fn(async () => ({
      get cwd() { return node.cwd; },
      get network() { return node.network; },
      tx: {
        plan: vi.fn(async () => ({ id: `plan-${++node.plans}` })),
        sign: vi.fn(async () => ({ txId: node.plans.toString(16).padStart(64, "0") })),
        simulate: vi.fn(async (s: any) => ({ receipt: { txId: s.txId, mode: "simulator" } })),
        send: vi.fn(async (s: any) => {
          node.broadcasts.push(s.txId);
          if (node.hang) await new Promise<void>((r) => (node.release = r));
          const submitResult = { accepted: true, transactionId: s.txId };
          return { receipt: { txId: s.txId, submitResult }, submission: { txId: s.txId, submitResult }, txId: s.txId, submitted: true };
        })
      }
    }))
  }
}));

const { dappTxRoutes } = await import("../src/routes/dapp-tx.js");
const guard: any = await import("../src/routes/send-guard.js");
const app = new Hono();
app.route("/api/tx", dappTxRoutes);
const restart = () => guard.__resetSendGuardForTests();
const PAY = { from: "alice", to: "bob", amountSompi: "1000", allowDevAutoSign: true };
async function send(body: Record<string, unknown>) {
  const res = await app.request(new Request("http://localhost/api/tx/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return (await res.json()) as any;
}

const roots: string[] = [];
const children: ChildProcess[] = [];
const lockOf = (root = node.cwd) => path.join(root, guard.SEND_GUARD_LOCK);
const readLock = (root = node.cwd) => JSON.parse(fs.readFileSync(lockOf(root), "utf8"));

/** A pid that is certainly not running: a child that already exited. */
async function deadPid(): Promise<number> {
  const c = spawn(process.execPath, ["-e", "0"], { stdio: "ignore" });
  await new Promise<void>((r) => c.once("exit", () => r()));
  return c.pid!;
}
async function liveChild(): Promise<ChildProcess> {
  const c = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  children.push(c);
  await new Promise<void>((r) => c.once("spawn", () => r()));
  return c;
}
function writeLock(content: Record<string, unknown>, root = node.cwd) {
  fs.mkdirSync(path.dirname(lockOf(root)), { recursive: true });
  fs.writeFileSync(lockOf(root), JSON.stringify(content));
}

beforeEach(() => {
  node.cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hk-lockrace-"));
  roots.push(node.cwd);
  node.network = "testnet-10";
  node.plans = 0;
  node.broadcasts = [];
  node.hang = false;
  hooks.beforeUnlink = undefined;
  restart();
});
afterAll(() => {
  restart();
  for (const c of children) c.kill();
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

describe("LOCK-RACE-1 · concurrent recovery of a stale lock never yields two owners", () => {
  it("interleaved: B reads the stale pid, A recovers and takes the lock, then B continues → B must NOT own, A's lock intact", async () => {
    const stale = await deadPid();
    writeLock({ pid: stale, at: new Date().toISOString() });
    const a = await liveChild();
    // A's recovery lands exactly between B's read of the stale pid and B's unlink
    hooks.beforeUnlink = (p) => {
      if (path.resolve(p) !== path.resolve(lockOf())) return;
      hooks.beforeUnlink = undefined;
      fs.rmSync(lockOf());
      writeLock({ pid: a.pid, nonce: "A", at: new Date().toISOString() });
    };
    const r = await send(PAY);
    const seen = JSON.stringify({ code: r.error?.code, plans: node.plans, broadcasts: node.broadcasts.length, lock: readLock() });
    expect(r.ok, seen).toBe(false);
    expect(node.plans, seen).toBe(0);
    expect(node.broadcasts, seen).toHaveLength(0);
    // never deleted someone else's lock: the file still names a process other than this one
    expect(readLock().pid, seen).not.toBe(process.pid);
  });

  it("a stale lock is refused (not removed automatically); its file stays as evidence", async () => {
    const stale = await deadPid();
    writeLock({ pid: stale, at: "2026-10-19T00:00:00.000Z" });
    const before = fs.readFileSync(lockOf(), "utf8");
    const r = await send(PAY);
    expect(r.error?.code).toBe("SEND_GUARD_LOCK_STALE");
    expect(r.error?.message).toContain(String(stale));
    expect(node.plans).toBe(0);
    expect(fs.readFileSync(lockOf(), "utf8")).toBe(before);
  });

  it("REAL processes: 2 racers × 25 rounds on a stale lock → never any owner; on a free lock → exactly one owner per round", async () => {
    const sg = pathToFileURL(path.resolve(__dirname, "../src/routes/send-guard.ts")).href;
    const racer = `
      const m = await import(${JSON.stringify(sg)});
      const [root, go] = process.argv.slice(1);
      while (!require("node:fs").existsSync(go)) await new Promise((r) => setTimeout(r, 1));
      const a = m.sendGuardFor(root).admit({ from: "a", to: "b", amountSompi: "1", allowDevAutoSign: true }, "testnet-10", true);
      process.stdout.write(a.kind === "proceed" ? "OWNER" : a.code);
      setTimeout(() => process.exit(0), 300);`;
    const runRound = async (root: string) => {
      const go = path.join(root, "go");
      const outs: Promise<string>[] = [0, 1].map(() => {
        const c = spawn(process.execPath, ["--no-warnings", "--input-type=module", "-e", `import { createRequire } from "node:module"; const require = createRequire(import.meta.url); ${racer}`, root, go], { stdio: ["ignore", "pipe", "inherit"] });
        children.push(c);
        let out = "";
        c.stdout!.on("data", (d) => (out += d));
        return new Promise<string>((r) => c.once("exit", () => r(out)));
      });
      await new Promise((r) => setTimeout(r, 150));
      fs.writeFileSync(go, "");
      return Promise.all(outs);
    };
    const stalePid = await deadPid();
    const staleOwners: number[] = [];
    const freeOwners: number[] = [];
    for (let i = 0; i < 25; i++) {
      const a = fs.mkdtempSync(path.join(os.tmpdir(), "hk-race-stale-"));
      roots.push(a);
      writeLock({ pid: stalePid, at: "2026-10-19T00:00:00.000Z" }, a);
      staleOwners.push((await runRound(a)).filter((o) => o === "OWNER").length);
      const b = fs.mkdtempSync(path.join(os.tmpdir(), "hk-race-free-"));
      roots.push(b);
      freeOwners.push((await runRound(b)).filter((o) => o === "OWNER").length);
    }
    expect(staleOwners.every((n) => n === 0), JSON.stringify({ staleOwners })).toBe(true);
    expect(freeOwners.every((n) => n === 1), JSON.stringify({ freeOwners })).toBe(true);
  }, 240_000);
});

describe("LOCK-RACE-1 · one physical workspace, one guard", () => {
  it("two paths to the same workspace (a junction) → the same guard: a running send blocks the same payment via the other path", async () => {
    const real = node.cwd;
    const alias = path.join(os.tmpdir(), `hk-lockrace-alias-${process.pid}-${Date.now()}`);
    fs.symlinkSync(real, alias, "junction");
    roots.push(alias);
    try {
      node.hang = true;
      const first = send(PAY);
      await vi.waitFor(() => expect(node.broadcasts).toHaveLength(1));
      node.cwd = alias;
      const second = await send(PAY);
      // one guard (its in-memory in-flight send) — not a second guard that happens to refuse for another reason
      expect(guard.sendGuardFor(alias)).toBe(guard.sendGuardFor(real));
      expect(second.error?.code).toBe("TX_SEND_IN_PROGRESS");
      expect(node.broadcasts).toHaveLength(1);
      node.release?.();
      await first;
    } finally {
      node.cwd = real;
      fs.rmSync(alias, { recursive: false, force: true });
    }
  });
});

describe("LOCK-RACE-1 · controlled recovery and lost ownership", () => {
  it("controlled recovery archives the stale lock (evidence kept), then sends work and earlier unknowns still block", async () => {
    expect(typeof guard.recoverStaleSendGuardLock).toBe("function");
    const stale = await deadPid();
    writeLock({ pid: stale, at: "2026-10-19T00:00:00.000Z" });
    const r = guard.recoverStaleSendGuardLock(node.cwd, { pid: stale });
    expect(r.archived).toMatch(/send-guard\.v1\.lock\.stale-/);
    expect(fs.existsSync(r.archived)).toBe(true);
    expect(JSON.parse(fs.readFileSync(r.archived, "utf8")).pid).toBe(stale);
    expect((await send(PAY)).ok).toBe(true);
  });

  it("controlled recovery refuses a lock whose process is alive, or that names another pid", async () => {
    const a = await liveChild();
    writeLock({ pid: a.pid, at: "2026-10-19T00:00:00.000Z" });
    expect(() => guard.recoverStaleSendGuardLock(node.cwd, { pid: a.pid })).toThrow(/alive|running/);
    const stale = await deadPid();
    expect(() => guard.recoverStaleSendGuardLock(node.cwd, { pid: stale })).toThrow(/names pid/);
    expect(readLock().pid).toBe(a.pid);
  });

  it("an owner whose lock was replaced by another owner stops sending (re-verified before every broadcast)", async () => {
    expect((await send(PAY)).ok).toBe(true);
    const other = await liveChild();
    fs.rmSync(lockOf());
    writeLock({ pid: other.pid, nonce: "other", at: new Date().toISOString() });
    const r = await send({ ...PAY, to: "carol" });
    expect(r.ok).toBe(false);
    expect(node.broadcasts).toHaveLength(1);
  });

  it("simnet keeps working while another process owns the guard", async () => {
    const other = await liveChild();
    writeLock({ pid: other.pid, at: new Date().toISOString() });
    node.network = "simulated";
    expect((await send(PAY)).ok).toBe(true);
  });
});
