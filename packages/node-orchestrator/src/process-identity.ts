import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * L2-EXT stage 4 (owner correction C1) · who a PID is, as the operating system says: its creation instant and the real
 * path of its executable. A process HardKAS started is recorded with both; it is "ours" later only if the PID is alive
 * AND both still match. A PID alone (reused by the OS) or an answer on a port (any process can answer) proves nothing.
 *
 *   Windows  Win32_Process.CreationDate (100 ns resolution) and ExecutablePath, through CIM
 *   Linux    /proc/<pid>/stat field 22 (starttime, in clock ticks since boot) and the /proc/<pid>/exe link
 *   macOS    `ps -o lstart=` and `ps -o comm=` (untested here: no macOS host in this audit)
 *
 * `undefined` means the identity could not be read (no such process, no permission, unreadable): callers treat that
 * as "not provably ours" and never act on it.
 */
export interface ProcessIdentity {
  readonly pid: number;
  /** Opaque creation instant; only compared for equality. */
  readonly startTime: string;
  /** Real path of the executable (case-folded on Windows). */
  readonly executable: string;
  /**
   * F-03 (independent audit) · the process's real argument vector as the OS reports it (Windows: the command line,
   * split with the MSVCRT rules; Linux: /proc/<pid>/cmdline), argv[0] included. Undefined where it cannot be read.
   */
  readonly argv?: readonly string[] | undefined;
}

/**
 * A Windows command line split into arguments, with the rules of the Microsoft C runtime (the ones Node uses to quote
 * spawn arguments): 2n backslashes + quote → n backslashes and a quote toggle; 2n+1 backslashes + quote → n backslashes
 * and a literal quote; other backslashes are literal; "" inside quotes is a literal quote.
 */
export function splitWindowsCommandLine(cmd: string): string[] {
  const args: string[] = [];
  let cur = "";
  let inQuotes = false;
  let started = false;
  for (let i = 0; i < cmd.length; ) {
    const c = cmd[i]!;
    if (c === "\\") {
      let n = 0;
      while (cmd[i] === "\\") {
        n++;
        i++;
      }
      if (cmd[i] === '"') {
        cur += "\\".repeat(Math.floor(n / 2));
        if (n % 2 === 1) {
          cur += '"';
          i++;
        }
      } else cur += "\\".repeat(n);
      started = true;
      continue;
    }
    if (c === '"') {
      if (inQuotes && cmd[i + 1] === '"') {
        cur += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      started = true;
      i++;
      continue;
    }
    if ((c === " " || c === "\t") && !inQuotes) {
      if (started) args.push(cur);
      cur = "";
      started = false;
      i++;
      continue;
    }
    cur += c;
    started = true;
    i++;
  }
  if (started) args.push(cur);
  return args;
}

export type ProcessIdentityReader = (pid: number) => Promise<ProcessIdentity | undefined>;

function run(file: string, args: readonly string[], timeoutMs = 15_000): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(file, args as string[], { timeout: timeoutMs, windowsHide: true, encoding: "utf8" }, (err, stdout) => {
      resolve(err ? undefined : stdout);
    });
  });
}

/** The comparable form of an executable path (resolved; case-insensitive on Windows). */
export function normalizeExecutable(p: string, platform: NodeJS.Platform = process.platform): string {
  const resolved = path.resolve(p);
  return platform === "win32" ? resolved.toLowerCase() : resolved;
}

async function readWindows(pid: number): Promise<ProcessIdentity | undefined> {
  const script =
    `$p = Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; ` +
    `if ($p -and $p.CreationDate -and $p.ExecutablePath) { ` +
    `[pscustomobject]@{ c = $p.CreationDate.ToUniversalTime().ToString('o'); e = $p.ExecutablePath; l = $p.CommandLine } | ConvertTo-Json -Compress }`;
  const out = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
  if (!out || !out.trim()) return undefined;
  try {
    const parsed = JSON.parse(out.trim()) as { c?: string; e?: string; l?: string | null };
    if (!parsed.c || !parsed.e) return undefined;
    return {
      pid,
      startTime: parsed.c,
      executable: normalizeExecutable(parsed.e, "win32"),
      argv: typeof parsed.l === "string" ? splitWindowsCommandLine(parsed.l) : undefined
    };
  } catch {
    return undefined;
  }
}

async function readLinux(pid: number): Promise<ProcessIdentity | undefined> {
  try {
    const stat = await fs.readFile(`/proc/${pid}/stat`, "utf8");
    // comm (field 2) may contain spaces and parentheses: the fields after it start after the LAST ')'
    const rest = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const startTime = rest[19]; // field 22 overall = index 19 after pid and comm
    const exe = await fs.readlink(`/proc/${pid}/exe`);
    if (!startTime || !exe) return undefined;
    const cmdline = await fs.readFile(`/proc/${pid}/cmdline`).catch(() => undefined);
    const argv = cmdline ? cmdline.toString("utf8").split("\0") : undefined;
    if (argv && argv[argv.length - 1] === "") argv.pop();
    return { pid, startTime: `ticks:${startTime}`, executable: normalizeExecutable(exe.replace(/ \(deleted\)$/, "#deleted"), "linux"), argv };
  } catch {
    return undefined;
  }
}

async function readDarwin(pid: number): Promise<ProcessIdentity | undefined> {
  const lstart = await run("ps", ["-o", "lstart=", "-p", String(pid)]);
  const comm = await run("ps", ["-o", "comm=", "-p", String(pid)]);
  if (!lstart?.trim() || !comm?.trim()) return undefined;
  return { pid, startTime: lstart.trim(), executable: normalizeExecutable(comm.trim(), "darwin") };
}

export const readProcessIdentity: ProcessIdentityReader = async (pid) => {
  if (!Number.isSafeInteger(pid) || pid <= 0) return undefined;
  if (process.platform === "win32") return readWindows(pid);
  if (process.platform === "linux") return readLinux(pid);
  if (process.platform === "darwin") return readDarwin(pid);
  return undefined;
};

/** Same process: same PID, same creation instant, same executable. */
export function sameIdentity(a: ProcessIdentity | undefined, b: ProcessIdentity | undefined): boolean {
  return !!a && !!b && a.pid === b.pid && a.startTime === b.startTime && a.executable === b.executable;
}
