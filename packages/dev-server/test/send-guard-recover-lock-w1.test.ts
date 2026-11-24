// REMED-CLOSE: a workspace of its own (HARDKAS_ROOT), never the repository root's .hardkas — imported first
import "./helpers/isolated-root.js";
import { describe, it, expect, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";

// BETA-FIX W1 · a stale send-guard lock left a PACKAGED user stuck: the dev server's SEND_GUARD_LOCK_STALE refusal named
// recoverStaleSendGuardLock(root, { pid }), which the published @hardkas/dev-server entry did not export, and no CLI
// command did it. And the lock was left behind by ordinary shutdowns: the CLI's dev-server runner handles SIGINT itself
// and ends the process by re-raising it (no "exit" event), and on Windows Ctrl+Break (SIGBREAK) was not handled at all;
// SIGHUP (the console window closed) crashed on its re-raise (Windows cannot raise it: ENOSYS). TerminateProcess
// (Stop-Process, Task Manager) cannot be handled by any process: that lock stays, and `hardkas dev recover-lock` archives it.

const SG = pathToFileURL(path.resolve(__dirname, "../src/routes/send-guard.ts")).href;
const roots: string[] = [];
const children: ChildProcess[] = [];
afterAll(() => {
  for (const c of children) if (c.exitCode === null && c.signalCode === null) c.kill();
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});
const tempRoot = () => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w1-lock-"));
  roots.push(r);
  return r;
};

/**
 * A real child process that owns a workspace's send guard (its lock created), then receives `signal` the way Node delivers
 * one to JS (the listeners run). `prelude` runs first: an application's own handlers (the CLI runner's).
 */
async function ownerThenSignal(root: string, signal: string, prelude = ""): Promise<{ code: number | null; signal: string | null; out: string; err: string }> {
  const script = `
    ${prelude}
    const m = await import(${JSON.stringify(SG)});
    const a = m.sendGuardFor(process.argv[1]).admit({ from: "a", to: "b", amountSompi: "1", allowDevAutoSign: true }, "testnet-10", true);
    process.stdout.write(a.kind + " listeners=" + process.listenerCount(${JSON.stringify(signal)}) + ";");
    setTimeout(() => {
      // nothing handles it: the signal's default ends the process, with no "exit" event (modelled by a hard kill)
      if (process.listenerCount(${JSON.stringify(signal)}) === 0) process.kill(process.pid, "SIGKILL");
      process.emit(${JSON.stringify(signal)}, ${JSON.stringify(signal)});
    }, 50);
    setTimeout(() => process.exit(7), 5000);`;
  const c = spawn(process.execPath, ["--no-warnings", "--input-type=module", "-e", script, root], { stdio: ["ignore", "pipe", "pipe"] });
  children.push(c);
  let out = "";
  let err = "";
  c.stdout!.on("data", (d) => (out += d));
  c.stderr!.on("data", (d) => (err += d));
  return new Promise((r) => c.once("exit", (code, sig) => r({ code, signal: sig, out, err })));
}

/** The CLI's dev-server runner (packages/cli/src/runners/dev-server-runner.ts): its own teardown, then the signal re-raised. */
const RUNNER_TEARDOWN = (sig: string) => `
  process.on(${JSON.stringify(sig)}, () => setTimeout(() => {
    process.removeAllListeners(${JSON.stringify(sig)});
    process.kill(process.pid, ${JSON.stringify(sig)});
  }, 20));`;

describe("BETA-FIX W1 · the shutdown signals release the send-guard lock", () => {
  it("Ctrl+C on a dev server whose runner handles SIGINT itself (teardown, then re-raise): the lock is released", async () => {
    const root = tempRoot();
    const lock = path.join(root, ".hardkas", "dev-server", "send-guard.v1.lock");
    const r = await ownerThenSignal(root, "SIGINT", RUNNER_TEARDOWN("SIGINT"));
    expect(r.out, r.err).toMatch(/^proceed/);
    expect(fs.existsSync(lock), JSON.stringify(r)).toBe(false);
  }, 30_000);

  it.skipIf(process.platform !== "win32")("Windows · Ctrl+Break (SIGBREAK): the lock is released and the process ends (128 + 21)", async () => {
    const root = tempRoot();
    const lock = path.join(root, ".hardkas", "dev-server", "send-guard.v1.lock");
    const r = await ownerThenSignal(root, "SIGBREAK");
    expect(r.out, r.err).toMatch(/^proceed listeners=1;/);
    expect(fs.existsSync(lock), JSON.stringify(r)).toBe(false);
    expect([r.code, r.err.includes("ENOSYS")], JSON.stringify(r)).toEqual([149, false]);
  }, 30_000);

  it("the console window closed (SIGHUP): the lock is released and the process ends as SIGHUP would, without crashing on the re-raise", async () => {
    const root = tempRoot();
    const lock = path.join(root, ".hardkas", "dev-server", "send-guard.v1.lock");
    const r = await ownerThenSignal(root, "SIGHUP");
    expect(fs.existsSync(lock), JSON.stringify(r)).toBe(false);
    expect(r.err, "Windows cannot raise SIGHUP: the re-raise must not crash").not.toMatch(/ENOSYS/);
    // POSIX: re-raised (killed by SIGHUP); Windows: ended with 128 + 1
    expect(r.signal === "SIGHUP" || r.code === 129, JSON.stringify(r)).toBe(true);
  }, 30_000);
});

describe("BETA-FIX W1 · a stale lock can be recovered from the package and named by its refusal", () => {
  /** A pid that is certainly not running: a child that already exited. */
  async function deadPid(): Promise<number> {
    const c = spawn(process.execPath, ["-e", "0"], { stdio: "ignore" });
    await new Promise<void>((r) => c.once("exit", () => r()));
    return c.pid!;
  }
  const writeLock = (root: string, content: Record<string, unknown>) => {
    const file = path.join(root, ".hardkas", "dev-server", "send-guard.v1.lock");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(content));
    return file;
  };

  it("the published entry (@hardkas/dev-server's index) exports recoverStaleSendGuardLock", async () => {
    const entry: any = await import("../src/index.js");
    expect(typeof entry.recoverStaleSendGuardLock).toBe("function");
  });

  it("the SEND_GUARD_LOCK_STALE refusal names the CLI command `hardkas dev recover-lock --pid <pid>`", async () => {
    const guard: any = await import("../src/routes/send-guard.js");
    const root = tempRoot();
    const stale = await deadPid();
    writeLock(root, { pid: stale, at: "2026-11-21T00:00:00.000Z" });
    const a = guard.sendGuardFor(root).admit({ from: "a", to: "b", amountSompi: "1", allowDevAutoSign: true }, "testnet-10", true);
    expect(a.code).toBe("SEND_GUARD_LOCK_STALE");
    expect(a.message).toContain(`hardkas dev recover-lock --pid ${stale}`);
  });

  it("each refusal of the recovery is typed: unreadable or missing lock, another pid, a live owner; nothing is changed", async () => {
    const guard: any = await import("../src/routes/send-guard.js");
    const codeOf = (f: () => unknown) => {
      try {
        f();
        return "RESOLVED";
      } catch (e: any) {
        return String(e?.code ?? "UNCODED");
      }
    };
    const missing = tempRoot();
    expect(codeOf(() => guard.recoverStaleSendGuardLock(missing, { pid: 4242 }))).toBe("SEND_GUARD_LOCK_UNREADABLE");
    const garbled = tempRoot();
    const g = writeLock(garbled, {});
    fs.writeFileSync(g, "{not json");
    expect(codeOf(() => guard.recoverStaleSendGuardLock(garbled, { pid: 4242 }))).toBe("SEND_GUARD_LOCK_UNREADABLE");
    const other = tempRoot();
    const stale = await deadPid();
    const o = writeLock(other, { pid: stale });
    expect(codeOf(() => guard.recoverStaleSendGuardLock(other, { pid: stale + 1 }))).toBe("SEND_GUARD_LOCK_PID_MISMATCH");
    const alive = tempRoot();
    const al = writeLock(alive, { pid: process.pid });
    expect(codeOf(() => guard.recoverStaleSendGuardLock(alive, { pid: process.pid }))).toBe("SEND_GUARD_LOCK_OWNER_ALIVE");
    expect([fs.readFileSync(g, "utf8"), JSON.parse(fs.readFileSync(o, "utf8")).pid, JSON.parse(fs.readFileSync(al, "utf8")).pid]).toEqual(["{not json", stale, process.pid]);
    // and a stale one is archived (evidence kept), the result naming the lock it archived
    const ok = guard.recoverStaleSendGuardLock(other, { pid: stale });
    expect([fs.existsSync(o), fs.existsSync(ok.archived), path.resolve(ok.lock)]).toEqual([false, true, path.resolve(fs.realpathSync.native(other), ".hardkas", "dev-server", "send-guard.v1.lock")]);
  });
});
