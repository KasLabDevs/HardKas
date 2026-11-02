import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import {
  startManagedProcess,
  stopManagedProcess,
  getManagedProcessStatus,
  readManagedProcessLog,
  MANAGED_PROCESS_SCHEMA,
  type ManagedProcessSpec,
  type ManagedProcessDeps
} from "../src/managed-process";
import { readProcessIdentity, splitWindowsCommandLine, type ProcessIdentity } from "../src/process-identity";
import { loopbackOwnershipProblem, procNetAddress } from "../src/socket-owner";
import { terminateWindowsProcessByHandle } from "../src/windows-terminate";

// L2-EXT stage 4 (owner correction C1) · the process manager never acts on a process it did not start. The "binary"
// is node running a tiny JSON-RPC server (eth_chainId); identities are the real ones the OS reports.

const SERVER = `
const http = require("http");
const [port, chain = "0x7a69", mode = "ok"] = process.argv.slice(2);
if (mode === "crash") { console.log("crashing"); process.exit(3); }
const s = http.createServer((req, res) => {
  if (mode === "silent") return;
  let b = ""; req.on("data", (d) => (b += d));
  req.on("end", () => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: chain })); });
});
s.listen(Number(port), "127.0.0.1", () => console.log("listening " + port));
setInterval(() => {}, 1 << 30);
`;

let root: string;
let script: string;
const children: ChildProcess[] = [];
const started: number[] = [];

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e?.code === "EPERM";
  }
};
const chainOf = async (port: number, signal?: AbortSignal) => {
  try {
    const r = await fetch(`http://127.0.0.1:${port}`, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId" }), signal: signal ?? AbortSignal.timeout(1000) });
    return ((await r.json()) as any).result as string;
  } catch {
    return undefined;
  }
};

let n = 0;
function specFor(port: number, over: Partial<ManagedProcessSpec> & { mode?: string } = {}): ManagedProcessSpec {
  const stateDir = path.join(root, `state-${++n}`);
  return {
    id: "test-node",
    binaryPath: process.execPath,
    args: [script, String(port), "0x7a69", over.mode ?? "ok"],
    stateDir,
    verifyBinary: () => ({ ok: true, sha256: "f".repeat(64), problems: [] }),
    port,
    readiness: async (signal) => (await chainOf(port, signal)) === "0x7a69",
    readinessTimeoutMs: 15_000,
    ...over
  };
}
const recordOf = (spec: ManagedProcessSpec) => JSON.parse(fs.readFileSync(path.join(spec.stateDir, "process.json"), "utf8"));

/** A long-lived process the manager did NOT start (the "victim" of a reused PID). */
function victim(): ChildProcess {
  const c = spawn(process.execPath, ["-e", "setInterval(() => {}, 1 << 30)"], { stdio: "ignore", windowsHide: true });
  children.push(c);
  return c;
}
const waitAlive = async (pid: number) => {
  for (let i = 0; i < 50 && !(await readProcessIdentity(pid)); i++) await new Promise((r) => setTimeout(r, 100));
};

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-managed-proc-"));
  script = path.join(root, "server.cjs");
  fs.writeFileSync(script, SERVER);
});
afterEach(() => {
  for (const pid of started.splice(0)) if (alive(pid)) try { process.kill(pid); } catch { /* gone */ }
});
afterAll(() => {
  for (const c of children) if (c.exitCode === null) c.kill();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("managed process · lifecycle", () => {
  it("start → ready → running (OS identity recorded) → logs → stop → not_running; stateless across calls (a HardKAS restart)", async () => {
    const port = await freePort();
    const spec = specFor(port);
    const { record } = await startManagedProcess(spec);
    started.push(record.pid);
    expect(record).toMatchObject({ schema: MANAGED_PROCESS_SCHEMA, id: "test-node", port, binaryPath: process.execPath });
    expect(record.identity).toEqual(await readProcessIdentity(record.pid));
    expect((await getManagedProcessStatus(spec)).state).toBe("running");
    expect(await readManagedProcessLog(spec, { tail: 5 })).toContain(`listening ${port}`);
    expect(await stopManagedProcess(spec)).toMatchObject({ result: "stopped", pid: record.pid });
    expect(alive(record.pid)).toBe(false);
    expect((await getManagedProcessStatus(spec)).state).toBe("not_running");
    expect(await stopManagedProcess(spec)).toMatchObject({ result: "not_running" });
  });

  it("a process that died outside HardKAS: stale_record; stop clears the record and kills nothing", async () => {
    const spec = specFor(await freePort());
    const { record } = await startManagedProcess(spec);
    process.kill(record.pid);
    for (let i = 0; i < 50 && alive(record.pid); i++) await new Promise((r) => setTimeout(r, 100));
    expect((await getManagedProcessStatus(spec)).state).toBe("stale_record");
    expect(await stopManagedProcess(spec)).toMatchObject({ result: "stale_record" });
    expect(fs.existsSync(path.join(spec.stateDir, "process.json"))).toBe(false);
  });
});

describe("managed process · never another process (C1)", () => {
  const plant = async (spec: ManagedProcessSpec, pid: number, identity: Partial<ProcessIdentity>) => {
    fs.mkdirSync(spec.stateDir, { recursive: true });
    const real = (await readProcessIdentity(pid))!;
    fs.writeFileSync(
      path.join(spec.stateDir, "process.json"),
      JSON.stringify({ schema: MANAGED_PROCESS_SCHEMA, id: "test-node", pid, startedAt: "x", identity: { ...real, ...identity }, binaryPath: "x", binarySha256: "x", args: [], logFile: "x" })
    );
  };

  it.each([
    ["the PID was reused (another start time)", { startTime: "2000-01-01T00:00:00.0000000Z" }],
    ["the PID was reused (another executable)", { executable: path.resolve("/not/the/recorded/anvil.exe") }]
  ])("%s: foreign_process; stop refuses to signal it (no kill on either platform path), removes the record, and the process survives unchanged", async (_name, identity) => {
    const v = victim();
    await waitAlive(v.pid!);
    const before = await readProcessIdentity(v.pid!);
    for (const platform of ["win32", "linux"] as const) {
      const spec = specFor(await freePort());
      await plant(spec, v.pid!, identity);
      const kills: Array<[number, string]> = [];
      // a real kill would still be sent: the spy records the call and forwards it
      const deps: ManagedProcessDeps = { platform, kill: (pid, signal) => { kills.push([pid, signal]); process.kill(pid, signal); } };
      expect((await getManagedProcessStatus(spec, deps)).state).toBe("foreign_process");
      expect(await stopManagedProcess(spec, {}, deps)).toMatchObject({ result: "foreign_process" });
      expect(kills).toEqual([]);
      expect(fs.existsSync(path.join(spec.stateDir, "process.json"))).toBe(false);
    }
    expect(alive(v.pid!)).toBe(true);
    expect(await readProcessIdentity(v.pid!)).toEqual(before);
  }, 30_000);

  it("identity unreadable: unverifiable; stop refuses and the process survives; start refuses too", async () => {
    const v = victim();
    await waitAlive(v.pid!);
    const spec = specFor(await freePort());
    await plant(spec, v.pid!, {});
    const deps: ManagedProcessDeps = { readIdentity: async () => undefined };
    expect((await getManagedProcessStatus(spec, deps)).state).toBe("unverifiable");
    await expect(stopManagedProcess(spec, {}, deps)).rejects.toMatchObject({ code: "PROCESS_STATE_UNVERIFIABLE" });
    await expect(startManagedProcess(spec, deps)).rejects.toMatchObject({ code: "PROCESS_STATE_UNVERIFIABLE" });
    expect(alive(v.pid!)).toBe(true);
  });

  it("the identity changes right before the forced kill (Windows path): nothing is killed", async () => {
    const spec = specFor(await freePort());
    const { record } = await startManagedProcess(spec);
    started.push(record.pid);
    let reads = 0;
    const kills: string[] = [];
    const deps: ManagedProcessDeps = {
      platform: "win32",
      // status read: still ours; the read right before the kill: somebody else
      readIdentity: async (pid) => (++reads === 1 ? record.identity : { ...record.identity, startTime: "changed" }),
      kill: (_pid, signal) => kills.push(signal)
    };
    expect(await stopManagedProcess(spec, {}, deps)).toMatchObject({ result: "foreign_process" });
    expect(kills).toEqual([]);
    expect(alive(record.pid)).toBe(true);
  });

  it.skipIf(process.platform !== "win32")("Windows path: the forced stop goes through the process handle with the recorded identity, never a kill by PID", async () => {
    const spec = specFor(await freePort());
    const { record } = await startManagedProcess(spec);
    started.push(record.pid);
    const kills: string[] = [];
    const handleCalls: ProcessIdentity[] = [];
    const deps: ManagedProcessDeps = {
      platform: "win32",
      kill: (_pid, signal) => kills.push(signal),
      terminateByHandle: async (identity, waitMs) => {
        handleCalls.push(identity);
        return terminateWindowsProcessByHandle(identity, waitMs);
      }
    };
    expect(await stopManagedProcess(spec, {}, deps)).toMatchObject({ result: "stopped", pid: record.pid });
    expect(handleCalls).toEqual([record.identity]);
    expect(kills).toEqual([]);
    expect(alive(record.pid)).toBe(false);
  }, 30_000);

  it("POSIX path: SIGTERM first, identity re-read, SIGKILL only when the process is still the same one", async () => {
    const spec = specFor(await freePort());
    const { record } = await startManagedProcess(spec);
    started.push(record.pid);
    const kills: string[] = [];
    const deps: ManagedProcessDeps = {
      platform: "linux",
      readIdentity: async () => record.identity,
      kill: (pid, signal) => {
        kills.push(signal);
        if (signal === "SIGKILL") process.kill(pid); // SIGTERM is ignored by this "process"
      }
    };
    expect(await stopManagedProcess(spec, { timeoutMs: 500 }, deps)).toMatchObject({ result: "stopped" });
    expect(kills).toEqual(["SIGTERM", "SIGKILL"]);
    expect(alive(record.pid)).toBe(false);
  });
});

// F-03 (independent audit) · the record is checked against what the OS reports, not trusted.
describe("F-03 · the real command line and the listening socket", () => {
  it("a record with the process's real identity but other arguments (forged): foreign_process; stop kills nothing", async () => {
    const spec = specFor(await freePort());
    const { record } = await startManagedProcess(spec);
    started.push(record.pid);
    const file = path.join(spec.stateDir, "process.json");
    const forged = { ...recordOf(spec), args: [script, "1", "0x7a69", "ok"] };
    fs.writeFileSync(file, JSON.stringify(forged));
    const st = await getManagedProcessStatus(spec);
    expect(st).toMatchObject({ state: "foreign_process", detail: expect.stringContaining("not the recorded") });
    expect(await stopManagedProcess(spec)).toMatchObject({ result: "foreign_process" });
    expect(alive(record.pid)).toBe(true);
  }, 30_000);

  it("the status carries the OS's view: the real argv equals what was spawned", async () => {
    const spec = specFor(await freePort());
    const { record } = await startManagedProcess(spec);
    started.push(record.pid);
    const st = await getManagedProcessStatus(spec);
    expect(st.state).toBe("running");
    expect(st.identity?.argv?.slice(1)).toEqual(spec.args);
  }, 30_000);

  it("splitWindowsCommandLine follows the MSVCRT rules (quotes, backslashes, spaces)", () => {
    expect(splitWindowsCommandLine(String.raw`"C:\Program Files\x.exe" a "b c" d\e "f\"g" "h\\" i""j`)).toEqual([
      String.raw`C:\Program Files\x.exe`,
      "a",
      "b c",
      String.raw`d\e`,
      'f"g',
      "h\\",
      "ij"
    ]);
    expect(splitWindowsCommandLine(`x "" y`)).toEqual(["x", "", "y"]);
  });

  it("procNetAddress decodes /proc/net/tcp and tcp6 addresses", () => {
    expect(procNetAddress("0100007F")).toBe("127.0.0.1");
    expect(procNetAddress("00000000")).toBe("0.0.0.0");
    expect(procNetAddress("00000000000000000000000000000000")).toBe("::");
    expect(procNetAddress("00000000000000000000000001000000")).toBe("::1");
  });

  it.skipIf(!["win32", "linux"].includes(process.platform))("the OS socket table: 127.0.0.1 by the right PID passes; another PID, 0.0.0.0, or nothing listening do not", async () => {
    const port = await freePort();
    const spec = specFor(port);
    const { record } = await startManagedProcess(spec);
    started.push(record.pid);
    expect(await loopbackOwnershipProblem(port, record.pid)).toBeUndefined();
    expect(await loopbackOwnershipProblem(port, record.pid + 1)).toMatch(/not served by PID/);
    expect(await loopbackOwnershipProblem(await freePort(), record.pid)).toMatch(/nothing listens/);
    // a server on every interface
    const all = await freePort();
    const c = spawn(process.execPath, ["-e", `require("http").createServer(()=>{}).listen(${all}, "0.0.0.0", () => console.log("up")); setInterval(()=>{}, 1<<30)`], {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    });
    children.push(c);
    await new Promise<void>((r) => c.stdout!.on("data", (d) => String(d).includes("up") && r()));
    expect(await loopbackOwnershipProblem(all, c.pid!)).toMatch(/0\.0\.0\.0/);
  }, 60_000);
});

// The real OS: the check and the terminate act on one handle, so only the exact recorded process can be terminated.
describe.skipIf(process.platform !== "win32")("Windows handle-bound terminate (real processes)", () => {
  // the recorded instant moved by one microsecond (the resolution the identity is recorded at)
  const plusOneMicrosecond = (iso: string) =>
    iso.replace(/\.(\d{7})Z$/, (_m, f: string) => `.${String(Number(f) >= 9_999_980 ? Number(f) - 10 : Number(f) + 10).padStart(7, "0")}Z`);

  it("the recorded identity: terminated through the handle", async () => {
    const v = victim();
    await waitAlive(v.pid!);
    const identity = (await readProcessIdentity(v.pid!))!;
    expect(await terminateWindowsProcessByHandle(identity, 5000)).toMatchObject({ outcome: "stopped" });
    expect(alive(v.pid!)).toBe(false);
  }, 30_000);

  it.each([
    ["a creation instant one microsecond off", (id: ProcessIdentity) => ({ ...id, startTime: plusOneMicrosecond(id.startTime) })],
    ["another executable", (id: ProcessIdentity) => ({ ...id, executable: path.resolve("/not/the/recorded/anvil.exe").toLowerCase() })]
  ])("%s: identity_changed, nothing terminated, the process unchanged", async (_name, alter) => {
    const v = victim();
    await waitAlive(v.pid!);
    const before = (await readProcessIdentity(v.pid!))!;
    const altered = alter(before);
    expect(altered).not.toEqual(before);
    expect(await terminateWindowsProcessByHandle(altered, 5000)).toMatchObject({ outcome: "identity_changed" });
    expect(alive(v.pid!)).toBe(true);
    expect(await readProcessIdentity(v.pid!)).toEqual(before);
  }, 30_000);

  it("a process that has exited: gone (or, if its PID was reused meanwhile, identity_changed): never a kill", async () => {
    const c = spawn(process.execPath, ["-e", "setTimeout(() => {}, 3000)"], { stdio: "ignore", windowsHide: true });
    const exited = new Promise((r) => c.once("exit", r));
    await waitAlive(c.pid!);
    const identity = (await readProcessIdentity(c.pid!))!;
    expect(identity).toBeDefined();
    await exited;
    const r = await terminateWindowsProcessByHandle(identity, 2000);
    expect(["gone", "identity_changed"]).toContain(r.outcome);
  }, 30_000);
});

describe("managed process · safe start", () => {
  it("a binary that does not match its pin is never spawned (PROCESS_BINARY_UNVERIFIED; no record, port stays free)", async () => {
    const port = await freePort();
    const spec = specFor(port, { verifyBinary: () => ({ ok: false, sha256: "", problems: ["anvil.exe: sha256 does not match the pin"] }) });
    await expect(startManagedProcess(spec)).rejects.toMatchObject({ code: "PROCESS_BINARY_UNVERIFIED" });
    expect(fs.existsSync(path.join(spec.stateDir, "process.json"))).toBe(false);
    expect(await chainOf(port)).toBeUndefined();
    expect(await readManagedProcessLog(spec)).toBe(""); // never launched: not even the start line was logged
  });

  it("a binary substituted after the pre-spawn check: the started process is stopped (PROCESS_BINARY_UNVERIFIED)", async () => {
    const port = await freePort();
    let calls = 0;
    const spec = specFor(port, { verifyBinary: () => (++calls === 1 ? { ok: true, sha256: "f", problems: [] } : { ok: false, sha256: "", problems: ["swapped"] }) });
    await expect(startManagedProcess(spec)).rejects.toMatchObject({ code: "PROCESS_BINARY_UNVERIFIED" });
    await new Promise((r) => setTimeout(r, 300));
    expect(await chainOf(port)).toBeUndefined();
    expect(fs.existsSync(path.join(spec.stateDir, "process.json"))).toBe(false);
  });

  it("a spawn failure is a typed rejection, not a crash (O-2): PROCESS_SPAWN_FAILED, no record", async () => {
    const spec = specFor(await freePort(), { binaryPath: path.join(root, "no-such-binary.exe") });
    await expect(startManagedProcess(spec)).rejects.toMatchObject({ code: "PROCESS_SPAWN_FAILED" });
    expect(fs.existsSync(path.join(spec.stateDir, "process.json"))).toBe(false);
  });

  it("a process that never answers: PROCESS_NOT_READY with its log tail; it is stopped and the record removed", async () => {
    const port = await freePort();
    const spec = specFor(port, { mode: "silent", readinessTimeoutMs: 2500 });
    const err = await startManagedProcess(spec).catch((e) => e);
    expect(err).toMatchObject({ code: "PROCESS_NOT_READY" });
    expect(err.message).toContain(`listening ${port}`);
    expect(err.metadata?.pid && alive(err.metadata.pid)).toBe(false);
    expect(fs.existsSync(path.join(spec.stateDir, "process.json"))).toBe(false);
  }, 20_000); // 2.5 s readiness + the verified stop (on Windows the handle helper starts PowerShell)

  it("a process that exits before it is ready: PROCESS_NOT_READY (exited)", async () => {
    const spec = specFor(await freePort(), { mode: "crash" });
    await expect(startManagedProcess(spec)).rejects.toMatchObject({ code: "PROCESS_NOT_READY", message: expect.stringContaining("exited before it was ready") });
  });

  it("the port is taken: PROCESS_PORT_IN_USE before any spawn", async () => {
    const port = await freePort();
    const busy = net.createServer();
    await new Promise<void>((r) => busy.listen(port, "127.0.0.1", () => r()));
    try {
      const spec = specFor(port);
      await expect(startManagedProcess(spec)).rejects.toMatchObject({ code: "PROCESS_PORT_IN_USE" });
      expect(fs.existsSync(path.join(spec.stateDir, "process.json"))).toBe(false);
    } finally {
      await new Promise<void>((r) => busy.close(() => r()));
    }
  });

  it("two concurrent starts: exactly one process; the other is PROCESS_ALREADY_RUNNING", async () => {
    const spec = specFor(await freePort());
    const results = await Promise.allSettled([startManagedProcess(spec), startManagedProcess(spec)]);
    const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
    const bad = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    for (const r of ok) started.push(r.value.record.pid);
    expect(ok).toHaveLength(1);
    expect(bad.map((b) => b.reason.code)).toEqual(["PROCESS_ALREADY_RUNNING"]);
    expect(recordOf(spec).pid).toBe(ok[0]!.value.record.pid);
    await stopManagedProcess(spec);
  });

  it("a lock left by a process that is gone is broken; one held by a live process makes the other wait, then PROCESS_LOCKED", async () => {
    const spec = specFor(await freePort());
    fs.mkdirSync(path.join(spec.stateDir, ".lock"), { recursive: true });
    fs.writeFileSync(path.join(spec.stateDir, ".lock", "owner.json"), JSON.stringify({ pid: 999_999_99 }));
    expect((await stopManagedProcess(spec)).result).toBe("not_running");
    const v = victim();
    fs.mkdirSync(path.join(spec.stateDir, ".lock"), { recursive: true });
    fs.writeFileSync(path.join(spec.stateDir, ".lock", "owner.json"), JSON.stringify({ pid: v.pid }));
    await expect(stopManagedProcess(spec, {}, { lockTimeoutMs: 500 })).rejects.toMatchObject({ code: "PROCESS_LOCKED" });
  });
});
