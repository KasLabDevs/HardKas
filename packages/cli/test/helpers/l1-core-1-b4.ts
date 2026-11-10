// L1-CORE-1 B4 · shared helpers of the B4 command tests: the BUILT CLI (packages/cli/dist/index.js) in a child process,
// run in temporary workspaces the tests create (and remove) themselves, with artifacts the CLI itself writes there.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cliDist, childEnv } from "../first-contact-helpers.js";

export interface CliRun {
  status: number | null;
  stdout: string;
  stderr: string;
  all: string;
}

export interface CliOptions {
  /** A complete environment (e.g. hermeticChildEnv); default childEnv(extra). */
  env?: NodeJS.ProcessEnv;
  extra?: Record<string, string>;
  timeoutMs?: number;
  input?: string;
}

/** One synchronous run of the built CLI. */
export function cli(args: string[], cwd: string, opts: CliOptions = {}): CliRun {
  const r = spawnSync(process.execPath, [cliDist, ...args], {
    cwd,
    env: opts.env ?? childEnv(opts.extra ?? {}),
    encoding: "utf8",
    timeout: opts.timeoutMs ?? 180_000,
    input: opts.input ?? "",
    windowsHide: true
  });
  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  return { status: r.status, stdout, stderr, all: `${stdout}\n${stderr}` };
}

/** One asynchronous run (a loopback fake in this process must keep answering); killed after `killAfterMs`. */
export function cliAsync(
  args: string[],
  cwd: string,
  opts: CliOptions & { killAfterMs?: number; onStdout?: (stdoutSoFar: string, child: ChildProcess) => void } = {}
): Promise<CliRun & { killed: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: opts.env ?? childEnv(opts.extra ?? {}), windowsHide: true });
    let stdout = "";
    let stderr = "";
    let killed = false;
    child.stdout!.on("data", (d) => {
      stdout += String(d);
      opts.onStdout?.(stdout, child);
    });
    child.stderr!.on("data", (d) => (stderr += String(d)));
    if (opts.input !== undefined) child.stdin!.end(opts.input);
    const timer = setTimeout(() => {
      killed = true;
      child.kill();
    }, opts.killAfterMs ?? 180_000);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr, all: `${stdout}\n${stderr}`, killed });
    });
  });
}

/** Every top-level JSON document of a stdout (pretty-printed documents start at column 0). */
export function jsonDocs(stdout: string): any[] {
  const docs: any[] = [];
  for (const chunk of stdout.split(/\r?\n(?=[{[])/)) {
    const text = chunk.trim();
    if (!text.startsWith("{") && !text.startsWith("[")) continue;
    try {
      docs.push(JSON.parse(text));
    } catch {
      /* not a document */
    }
  }
  return docs;
}

/** The first JSON object of a stdout (the command's envelope), or undefined. */
export function envelope(stdout: string): any {
  return jsonDocs(stdout).find((d) => d && typeof d === "object" && !Array.isArray(d));
}

/**
 * A new temp directory, by its real path: on macOS `os.tmpdir()` is under the /var -> /private/var symlink, and a CLI
 * run there reports paths from its working directory, which the OS gives already resolved (/private/var/...).
 */
export function tempDir(prefix: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

/** Removes a test's temp directory (retrying while a killed child still releases its handles on Windows). */
export function removeDir(dir: string | undefined): void {
  if (dir) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}

/** `hardkas init b4ws --network simulated --skip-toolchain` in a new temp directory. */
export function simulatedWorkspace(prefix: string): { parent: string; ws: string } {
  const parent = tempDir(prefix);
  const r = cli(["init", "b4ws", "--network", "simulated", "--skip-toolchain", "--json"], parent);
  if (r.status !== 0) throw new Error(`hardkas init failed (exit ${r.status}):\n${r.all.slice(0, 2000)}`);
  return { parent, ws: path.join(parent, "b4ws") };
}

export interface Payment {
  plan: any;
  signed: any;
  receipt: any;
  /** The receipt artifact file the CLI wrote. */
  receiptPath: string;
  planPath: string;
}

/** A simulated payment alice -> bob (`tx send --yes --json`), as the CLI recorded it. */
export function pay(ws: string, amountKas = "1"): Payment {
  const r = cli(["tx", "send", "--from", "alice", "--to", "bob", "--amount", amountKas, "--yes", "--json"], ws);
  const doc = envelope(r.stdout);
  if (r.status !== 0 || doc?.ok !== true) throw new Error(`hardkas tx send failed (exit ${r.status}):\n${r.all.slice(0, 2000)}`);
  const { plan, signed, receipt } = doc.data;
  return {
    plan,
    signed,
    receipt,
    receiptPath: path.join(ws, ".hardkas", "artifacts", "receipts", `txReceipt-${receipt.contentHash}.json`),
    planPath: path.join(ws, ".hardkas", "artifacts", "plans", `txPlan-${plan.contentHash}.json`)
  };
}

/** Every file under a directory, relative and with forward slashes, sorted. */
export function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(path.relative(dir, p).split(path.sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

/** path -> bytes (hex) of every file under a directory: proves a command changed nothing. */
export function snapshotFiles(dir: string): Record<string, string> {
  const snap: Record<string, string> = {};
  for (const f of listFiles(dir)) snap[f] = fs.readFileSync(path.join(dir, f)).toString("hex");
  return snap;
}
