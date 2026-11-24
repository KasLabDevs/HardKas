import { execFile } from "node:child_process";
import fs from "node:fs/promises";

/**
 * F-03 (independent audit) · who listens on a TCP port, as the operating system says, so a node record's "bound to
 * 127.0.0.1 by this PID" can be checked against reality instead of being trusted.
 *
 *   Windows  Get-NetTCPConnection -State Listen (the IP Helper table: local address + owning process)
 *   Linux    /proc/net/tcp and /proc/net/tcp6 (LISTEN entries: local address + socket inode), and the inode mapped to
 *            the process that holds it through /proc/<pid>/fd (only processes this user may inspect)
 *   other    not implemented: undefined ("cannot tell"), which callers treat as not proven
 */
export interface TcpListener {
  /** The local address as the OS reports it (127.0.0.1, 0.0.0.0, ::, ::1, …). */
  readonly address: string;
  /** The owning process, when the OS says (undefined on Linux for a socket of a process this user cannot inspect). */
  readonly pid: number | undefined;
}

export type TcpListenerReader = (port: number) => Promise<readonly TcpListener[] | undefined>;

function run(file: string, args: readonly string[], timeoutMs = 15_000): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(file, args as string[], { timeout: timeoutMs, windowsHide: true, encoding: "utf8" }, (err, stdout) => resolve(err ? undefined : stdout));
  });
}

async function windowsListeners(port: number): Promise<readonly TcpListener[] | undefined> {
  const script =
    `$c = @(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | ` +
    `ForEach-Object { [pscustomobject]@{ a = $_.LocalAddress; p = [int]$_.OwningProcess } }); ` +
    `ConvertTo-Json -Compress -InputObject $c`;
  const out = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
  if (out === undefined) return undefined;
  try {
    const parsed = JSON.parse(out.trim() || "[]") as { a: string; p: number }[] | { a: string; p: number } | null;
    const rows = parsed === null ? [] : Array.isArray(parsed) ? parsed : [parsed];
    return rows.map((r) => ({ address: String(r.a), pid: Number.isInteger(r.p) ? r.p : undefined }));
  } catch {
    return undefined;
  }
}

/** /proc/net/tcp* address (hex, host byte order per 32-bit word) to text. */
export function procNetAddress(hex: string): string {
  if (hex.length === 8) {
    const b = Buffer.from(hex, "hex");
    return `${b[3]}.${b[2]}.${b[1]}.${b[0]}`;
  }
  const words = hex.match(/.{8}/g) ?? [];
  const bytes = Buffer.concat(words.map((w) => Buffer.from(w, "hex").reverse()));
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(bytes.readUInt16BE(i).toString(16));
  const v6 = groups.join(":");
  if (v6 === "0:0:0:0:0:0:0:0") return "::";
  if (v6 === "0:0:0:0:0:0:0:1") return "::1";
  if (v6.startsWith("0:0:0:0:0:ffff:")) return `::ffff:${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
  return v6;
}

async function linuxListeners(port: number): Promise<readonly TcpListener[] | undefined> {
  const found: { address: string; inode: string }[] = [];
  for (const table of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let text: string;
    try {
      text = await fs.readFile(table, "utf8");
    } catch {
      if (table.endsWith("tcp")) return undefined;
      continue;
    }
    for (const line of text.split("\n").slice(1)) {
      const f = line.trim().split(/\s+/);
      if (f.length < 10) continue;
      const [addr, p] = f[1]!.split(":");
      if (f[3] !== "0A" || Number.parseInt(p!, 16) !== port) continue; // 0A = LISTEN
      found.push({ address: procNetAddress(addr!), inode: f[9]! });
    }
  }
  if (found.length === 0) return [];
  const owner = new Map<string, number>();
  const wanted = new Set(found.map((x) => `socket:[${x.inode}]`));
  for (const d of await fs.readdir("/proc").catch(() => [] as string[])) {
    if (!/^\d+$/.test(d)) continue;
    const fds = await fs.readdir(`/proc/${d}/fd`).catch(() => [] as string[]);
    for (const fd of fds) {
      const link = await fs.readlink(`/proc/${d}/fd/${fd}`).catch(() => "");
      if (wanted.has(link)) owner.set(link, Number(d));
    }
  }
  return found.map((x) => ({ address: x.address, pid: owner.get(`socket:[${x.inode}]`) }));
}

export const readTcpListeners: TcpListenerReader = async (port) => {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return undefined;
  if (process.platform === "win32") return windowsListeners(port);
  if (process.platform === "linux") return linuxListeners(port);
  return undefined;
};

/**
 * Why `port` is NOT served by `pid` on 127.0.0.1 alone, or undefined when it is: every listener on the port must be
 * 127.0.0.1 and owned by `pid`, and there must be at least one.
 */
export async function loopbackOwnershipProblem(port: number, pid: number, read: TcpListenerReader = readTcpListeners): Promise<string | undefined> {
  const listeners = await read(port);
  if (listeners === undefined) return `the listeners of port ${port} cannot be read on this system`;
  if (listeners.length === 0) return `nothing listens on port ${port}`;
  const bad = listeners.filter((l) => l.address !== "127.0.0.1" || l.pid !== pid);
  if (bad.length > 0) {
    return `port ${port} is not served by PID ${pid} on 127.0.0.1 only: ${listeners.map((l) => `${l.address} by ${l.pid ?? "an unknown process"}`).join(", ")}`;
  }
  return undefined;
}
