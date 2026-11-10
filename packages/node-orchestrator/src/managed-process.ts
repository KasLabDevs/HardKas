import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { HardkasError, writeFileAtomic } from "@hardkas/core";
import {
  normalizeExecutable,
  readProcessIdentity,
  sameIdentity,
  type ProcessIdentity,
  type ProcessIdentityReader
} from "./process-identity";
import { terminateWindowsProcessByHandle, type HandleTerminator } from "./windows-terminate";

/**
 * L2-EXT stage 4 (design §3.6, owner correction C1) · a native process HardKAS starts, watches and stops — and never a
 * process it did not start. Fixes O-1..O-5 of the old kaspad orchestrator (process.ts):
 *   O-1  `stop` acts only when the PID is alive AND the OS confirms its identity (creation instant + real executable)
 *        is the one recorded at start; otherwise it reports `stale_record` / `foreign_process` and kills nothing.
 *        The identity is read again immediately before a forced kill. On Windows that last check and the kill go
 *        through one process handle (windows-terminate.ts), so the PID cannot be reused between them. On POSIX the
 *        re-read and the signal are two steps: a residual window remains (Node has no pidfd), local use only.
 *   O-2  a spawn error rejects the start (it threw inside an event handler and crashed the CLI).
 *   O-3  readiness is a caller-defined probe with a timeout; a process that never gets ready is stopped (verified)
 *        and the error carries the tail of its log.
 *   O-4  stop waits for the exit and escalates to a forced kill only while the identity still matches.
 *   O-5  the state directory comes from the caller (the invocation's one workspace root).
 * Also: the binary is verified against its pin right before the spawn and again once it runs; the loopback port must be
 * free; the record is written atomically; one lock serialises start/stop on the same state directory.
 */

export const MANAGED_PROCESS_SCHEMA = "hardkas.process.v1";

export interface ManagedProcessSpec {
  readonly id: string;
  readonly binaryPath: string;
  readonly args: readonly string[];
  /** `<workspace>/.hardkas/processes/<id>`: record, log and lock. */
  readonly stateDir: string;
  /** Run right before the spawn and once the process runs: a binary that does not match its pin is never run. */
  readonly verifyBinary: () => { readonly ok: boolean; readonly sha256: string; readonly problems: readonly string[] };
  /** A loopback port the process will bind: it must be free before the spawn. */
  readonly port?: number | undefined;
  /** True once the process serves (e.g. eth_chainId == 31337). */
  readonly readiness: (signal: AbortSignal) => Promise<boolean>;
  readonly readinessTimeoutMs: number;
}

export interface ManagedProcessRecord {
  readonly schema: typeof MANAGED_PROCESS_SCHEMA;
  readonly id: string;
  readonly pid: number;
  readonly startedAt: string;
  readonly identity: ProcessIdentity;
  readonly binaryPath: string;
  readonly binarySha256: string;
  readonly args: readonly string[];
  readonly logFile: string;
  readonly port?: number | undefined;
}

export type ManagedProcessState =
  /** Alive, and the OS confirms it is the instance HardKAS started. */
  | "running"
  /** No record. */
  | "not_running"
  /** A record whose process has exited. */
  | "stale_record"
  /** The recorded PID now belongs to another process (reused): never ours, never killed. */
  | "foreign_process"
  /** The recorded PID is alive but its identity cannot be read: nothing is done to it. */
  | "unverifiable";

export interface ManagedProcessStatus {
  readonly state: ManagedProcessState;
  readonly record?: ManagedProcessRecord | undefined;
  /** What the OS reports for the recorded PID now (when it could be read). */
  readonly identity?: ProcessIdentity | undefined;
  readonly detail: string;
}

/** Test seams: how identities are read and signals sent. */
export interface ManagedProcessDeps {
  readonly readIdentity?: ProcessIdentityReader;
  readonly kill?: (pid: number, signal: NodeJS.Signals) => void;
  /** Windows: check + terminate through one process handle. */
  readonly terminateByHandle?: HandleTerminator;
  readonly lockTimeoutMs?: number;
  readonly platform?: NodeJS.Platform;
}

const recordPath = (stateDir: string) => path.join(stateDir, "process.json");
const lockPath = (stateDir: string) => path.join(stateDir, ".lock");
export const managedProcessLogPath = (spec: Pick<ManagedProcessSpec, "id" | "stateDir">) => path.join(spec.stateDir, `${spec.id}.log`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e?.code === "EPERM";
  }
}

function readRecord(stateDir: string): ManagedProcessRecord | undefined {
  try {
    const r = JSON.parse(fs.readFileSync(recordPath(stateDir), "utf8"));
    if (r?.schema !== MANAGED_PROCESS_SCHEMA || !Number.isSafeInteger(r.pid) || !r.identity) return undefined;
    return r as ManagedProcessRecord;
  } catch {
    return undefined;
  }
}

async function removeRecord(stateDir: string): Promise<void> {
  await fsp.rm(recordPath(stateDir), { force: true });
}

function error(code: string, message: string, metadata?: Record<string, unknown>): HardkasError {
  return new HardkasError(code, message, { metadata });
}

/** Last lines of the process log (for errors and `logs`). */
export async function readManagedProcessLog(spec: Pick<ManagedProcessSpec, "id" | "stateDir">, opts: { tail?: number } = {}): Promise<string> {
  let text: string;
  try {
    text = await fsp.readFile(managedProcessLogPath(spec), "utf8");
  } catch {
    return "";
  }
  if (opts.tail === undefined) return text;
  return text.split(/\r?\n/).slice(-(opts.tail + 1)).join("\n");
}

/** One start/stop at a time per state directory (an mkdir lock; a lock whose owner exited is broken). */
async function withLock<T>(stateDir: string, deps: ManagedProcessDeps, fn: () => Promise<T>): Promise<T> {
  await fsp.mkdir(stateDir, { recursive: true });
  const lock = lockPath(stateDir);
  const deadline = Date.now() + (deps.lockTimeoutMs ?? 120_000);
  for (;;) {
    try {
      await fsp.mkdir(lock);
      await fsp.writeFile(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      break;
    } catch (e: any) {
      if (e?.code !== "EEXIST") throw e;
      let owner: { pid?: number } | undefined;
      try {
        owner = JSON.parse(fs.readFileSync(path.join(lock, "owner.json"), "utf8"));
      } catch {
        owner = undefined;
      }
      const age = Date.now() - (fs.statSync(lock, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
      // a lock held by a process that is gone (or a lock half-written for long) is left over: break it
      if ((owner?.pid !== undefined && !isAlive(owner.pid)) || (owner === undefined && age > 30_000)) {
        await fsp.rm(lock, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) throw error("PROCESS_LOCKED", `another HardKAS command is starting or stopping '${path.basename(stateDir)}' (lock ${lock})`);
      await sleep(100);
    }
  }
  try {
    return await fn();
  } finally {
    await fsp.rm(lock, { recursive: true, force: true });
  }
}

async function statusOf(stateDir: string, deps: ManagedProcessDeps): Promise<ManagedProcessStatus> {
  const readIdentity = deps.readIdentity ?? readProcessIdentity;
  const record = readRecord(stateDir);
  if (!record) return { state: "not_running", detail: "no process record" };
  if (!isAlive(record.pid)) return { state: "stale_record", record, detail: `process ${record.pid} has exited` };
  const now = await readIdentity(record.pid);
  if (!now) return { state: "unverifiable", record, detail: `process ${record.pid} is alive but its identity cannot be read` };
  if (sameIdentity(now, record.identity)) {
    // F-03 (independent audit): the record is not trusted for what the process runs: its real command line (as the OS
    // reports it) must be the recorded binary's arguments. A record copied onto another process with the same
    // identity but other arguments (another --host, another port) is foreign: never reported running, never killed.
    const platform = deps.platform ?? process.platform;
    if (platform === "win32" || platform === "linux") {
      if (!now.argv) return { state: "unverifiable", record, identity: now, detail: `the command line of process ${record.pid} cannot be read` };
      const real = now.argv.slice(1);
      if (real.length !== record.args.length || real.some((a, i) => a !== record.args[i])) {
        return {
          state: "foreign_process",
          record,
          identity: now,
          detail: `process ${record.pid} has the recorded identity but runs ${JSON.stringify(real)}, not the recorded ${JSON.stringify(record.args)}: the record was not written for it`
        };
      }
    } else if (platform === "darwin") {
      // macOS's ps keeps no argument boundaries: the whole command line is compared with the one this record started
      // (spawn passes the binary path as argv[0]). Arguments that join to the same text cannot be told apart there.
      if (now.commandLine === undefined) return { state: "unverifiable", record, identity: now, detail: `the command line of process ${record.pid} cannot be read` };
      const expected = [record.binaryPath, ...record.args].join(" ");
      if (now.commandLine !== expected) {
        return {
          state: "foreign_process",
          record,
          identity: now,
          detail: `process ${record.pid} has the recorded identity but runs ${JSON.stringify(now.commandLine)}, not the recorded ${JSON.stringify(expected)}: the record was not written for it`
        };
      }
    }
    return { state: "running", record, identity: now, detail: `process ${record.pid} is the instance started at ${record.startedAt}` };
  }
  return {
    state: "foreign_process",
    record,
    identity: now,
    detail: `PID ${record.pid} now belongs to another process (${now.executable}, started ${now.startTime}); the recorded one (${record.identity.executable}, started ${record.identity.startTime}) is gone`
  };
}

export async function getManagedProcessStatus(spec: Pick<ManagedProcessSpec, "stateDir">, deps: ManagedProcessDeps = {}): Promise<ManagedProcessStatus> {
  return statusOf(spec.stateDir, deps);
}

/** True when nothing listens on 127.0.0.1:port. */
export function isLoopbackPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen({ port, host: "127.0.0.1", exclusive: true }, () => s.close(() => resolve(true)));
  });
}

/** Kills the recorded process only while the OS still says it is that process (re-read right before each signal). */
async function terminateVerified(record: ManagedProcessRecord, deps: ManagedProcessDeps, timeoutMs: number): Promise<"stopped" | "identity_changed"> {
  const readIdentity = deps.readIdentity ?? readProcessIdentity;
  const kill = deps.kill ?? ((pid: number, signal: NodeJS.Signals) => process.kill(pid, signal));
  const platform = deps.platform ?? process.platform;
  const gone = async () => !isAlive(record.pid) || !sameIdentity(await readIdentity(record.pid), record.identity);
  const waitGone = async (ms: number) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (!isAlive(record.pid)) return true;
      await sleep(100);
    }
    return gone();
  };

  // graceful first (POSIX); Windows has no SIGTERM semantics for a console process: it goes to the verified kill
  if (platform !== "win32") {
    if (!sameIdentity(await readIdentity(record.pid), record.identity)) return "identity_changed";
    try {
      kill(record.pid, "SIGTERM");
    } catch {
      /* exited meanwhile */
    }
    if (await waitGone(timeoutMs)) return "stopped";
  }
  // forced, only if it is still provably the same process (read again now: the PID may have been reused)
  if (!isAlive(record.pid)) return "stopped";
  if (!sameIdentity(await readIdentity(record.pid), record.identity)) return "identity_changed";
  if (platform === "win32") {
    // the decisive check and the kill act on one handle: the process checked is the process terminated
    const r = await (deps.terminateByHandle ?? terminateWindowsProcessByHandle)(record.identity, timeoutMs);
    if (r.outcome === "stopped" || r.outcome === "gone") return "stopped";
    if (r.outcome === "identity_changed") return "identity_changed";
    throw error(r.outcome === "timeout" ? "PROCESS_STOP_FAILED" : "PROCESS_STATE_UNVERIFIABLE", `process ${record.pid}: ${r.detail}`, { pid: record.pid });
  }
  try {
    kill(record.pid, "SIGKILL");
  } catch {
    /* exited meanwhile */
  }
  if (await waitGone(timeoutMs)) return "stopped";
  throw error("PROCESS_STOP_FAILED", `process ${record.pid} did not exit after a forced kill`, { pid: record.pid });
}

export interface StartedManagedProcess {
  readonly state: "started";
  readonly record: ManagedProcessRecord;
}

export async function startManagedProcess(spec: ManagedProcessSpec, deps: ManagedProcessDeps = {}): Promise<StartedManagedProcess> {
  const readIdentity = deps.readIdentity ?? readProcessIdentity;
  return withLock(spec.stateDir, deps, async () => {
    const current = await statusOf(spec.stateDir, deps);
    if (current.state === "running") {
      throw error("PROCESS_ALREADY_RUNNING", `'${spec.id}' is already running (PID ${current.record!.pid})`, { pid: current.record!.pid });
    }
    if (current.state === "unverifiable") {
      throw error("PROCESS_STATE_UNVERIFIABLE", `${current.detail}: nothing was started`, { pid: current.record!.pid });
    }
    // a stale or foreign record is not ours: it is dropped (and nothing is killed)
    if (current.state !== "not_running") await removeRecord(spec.stateDir);

    const verified = spec.verifyBinary();
    if (!verified.ok) {
      throw error("PROCESS_BINARY_UNVERIFIED", `${spec.binaryPath} does not match its pin: ${verified.problems.join("; ")}. Nothing was started.`);
    }
    if (spec.port !== undefined && !(await isLoopbackPortFree(spec.port))) {
      throw error("PROCESS_PORT_IN_USE", `127.0.0.1:${spec.port} is already in use: nothing was started`, { port: spec.port });
    }

    const logFile = managedProcessLogPath(spec);
    await fsp.appendFile(logFile, `\n--- ${new Date().toISOString()} hardkas start ${spec.id}: ${spec.binaryPath} ${spec.args.join(" ")}\n`); // hardkas-append-allow: a process log, not a ledger
    const fd = fs.openSync(logFile, "a");
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(spec.binaryPath, spec.args as string[], { detached: true, windowsHide: true, stdio: ["ignore", fd, fd] });
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", () => resolve());
        child.once("error", (e) => reject(error("PROCESS_SPAWN_FAILED", `could not start ${spec.binaryPath}: ${e.message}`)));
      });
    } finally {
      fs.closeSync(fd);
    }
    const pid = child.pid!;
    child.unref();
    const killChild = async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await sleep(200);
    };

    // the identity of the instance just started, read from the OS
    let identity: ProcessIdentity | undefined;
    for (let i = 0; i < 20 && !identity; i++) {
      identity = await readIdentity(pid);
      if (!identity) {
        if (!isAlive(pid)) break;
        await sleep(150);
      }
    }
    if (!identity) {
      if (!isAlive(pid)) {
        const tail = await readManagedProcessLog(spec, { tail: 20 });
        throw error("PROCESS_NOT_READY", `${spec.id} exited before it was ready. Log tail:\n${tail}`, { pid });
      }
      await killChild();
      throw error("PROCESS_IDENTITY_UNREADABLE", `started ${spec.id} (PID ${pid}) but could not read its identity; it was stopped`, { pid });
    }
    const expectedExe = normalizeExecutable(fs.realpathSync(spec.binaryPath));
    const again = spec.verifyBinary();
    if (identity.executable !== expectedExe || !again.ok) {
      await killChild();
      throw error(
        "PROCESS_BINARY_UNVERIFIED",
        `the started process is not the verified binary (${identity.executable}${again.ok ? "" : `; ${again.problems.join("; ")}`}); it was stopped`,
        { pid }
      );
    }

    const record: ManagedProcessRecord = {
      schema: MANAGED_PROCESS_SCHEMA,
      id: spec.id,
      pid,
      startedAt: new Date().toISOString(),
      identity,
      binaryPath: spec.binaryPath,
      binarySha256: verified.sha256,
      args: [...spec.args],
      logFile,
      ...(spec.port !== undefined ? { port: spec.port } : {})
    };
    await writeFileAtomic(recordPath(spec.stateDir), JSON.stringify(record, null, 2) + "\n");

    // readiness: until the probe says so, the process exits, or the timeout
    const until = Date.now() + spec.readinessTimeoutMs;
    let ready = false;
    while (Date.now() < until) {
      if (!isAlive(pid)) break;
      try {
        if (await spec.readiness(AbortSignal.timeout(Math.min(2000, Math.max(100, until - Date.now()))))) {
          ready = true;
          break;
        }
      } catch {
        /* not yet */
      }
      await sleep(200);
    }
    if (!ready) {
      const exited = !isAlive(pid);
      if (!exited) await terminateVerified(record, deps, 5000);
      await removeRecord(spec.stateDir);
      const tail = await readManagedProcessLog(spec, { tail: 20 });
      throw error(
        "PROCESS_NOT_READY",
        `${spec.id} ${exited ? "exited before it was ready" : `was not ready after ${spec.readinessTimeoutMs} ms and was stopped`}. Log tail:\n${tail}`,
        { pid }
      );
    }
    return { state: "started", record };
  });
}

export type StopResult = "stopped" | "not_running" | "stale_record" | "foreign_process";

export async function stopManagedProcess(
  spec: Pick<ManagedProcessSpec, "id" | "stateDir">,
  opts: { timeoutMs?: number } = {},
  deps: ManagedProcessDeps = {}
): Promise<{ result: StopResult; detail: string; pid?: number }> {
  return withLock(spec.stateDir, deps, async () => {
    const st = await statusOf(spec.stateDir, deps);
    if (st.state === "not_running") return { result: "not_running", detail: st.detail };
    if (st.state === "unverifiable") throw error("PROCESS_STATE_UNVERIFIABLE", `${st.detail}: nothing was stopped`, { pid: st.record!.pid });
    if (st.state === "stale_record" || st.state === "foreign_process") {
      // not ours: the record goes, the process (if any) is left alone
      await removeRecord(spec.stateDir);
      return { result: st.state, detail: `${st.detail}; nothing was killed`, pid: st.record!.pid };
    }
    const outcome = await terminateVerified(st.record!, deps, opts.timeoutMs ?? 5000);
    await removeRecord(spec.stateDir);
    if (outcome === "identity_changed") {
      return { result: "foreign_process", detail: `PID ${st.record!.pid} changed identity before it was signalled; nothing was killed`, pid: st.record!.pid };
    }
    return { result: "stopped", detail: `process ${st.record!.pid} stopped`, pid: st.record!.pid };
  });
}
