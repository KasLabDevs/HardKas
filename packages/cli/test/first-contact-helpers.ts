import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";

// First contact · shared helpers for the "newcomer" tests: a consumer project in a
// temp directory that resolves `@hardkas/*` through `node_modules` exactly like an
// installed package (package.json `exports` → built `dist`), never through the
// monorepo's vitest source aliases.

export const repoRoot = path.resolve(__dirname, "../../..");
export const cliDist = path.join(repoRoot, "packages", "cli", "dist", "index.js");

export interface ConsumerDir {
  dir: string;
  links: string[];
}

/** Creates a consumer project whose node_modules link to the repo's packages. */
export function makeConsumerDir(prefix: string, hardkasPackages: string[], extraModules: Record<string, string> = {}): ConsumerDir {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const links: string[] = [];
  const link = (target: string, at: string) => {
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.symlinkSync(target, at, "junction");
    links.push(at);
  };
  for (const p of hardkasPackages) link(path.join(repoRoot, "packages", p), path.join(dir, "node_modules", "@hardkas", p));
  for (const [name, target] of Object.entries(extraModules)) link(target, path.join(dir, "node_modules", name));
  return { dir, links };
}

/** Removes a consumer project: links first (never their targets), then the directory. */
export function removeConsumerDir(c: ConsumerDir | undefined): void {
  if (!c) return;
  for (const l of c.links) {
    try {
      const st = fs.lstatSync(l);
      if (st.isSymbolicLink()) fs.unlinkSync(l);
      else if (st.isDirectory()) fs.rmdirSync(l); // a Windows junction; rmdir removes the link only
    } catch {
      /* already gone */
    }
  }
  for (const l of c.links) {
    if (fs.existsSync(l)) throw new Error(`refusing to delete ${c.dir}: link ${l} could not be removed`);
  }
  fs.rmSync(c.dir, { recursive: true, force: true });
}

/** Environment for spawned processes: no inherited vitest worker state, no colour. */
export function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("VITEST") || k === "TEST" || k === "NODE_ENV") continue;
    env[k] = v;
  }
  return { ...env, NO_COLOR: "1", HARDKAS_TEST_IGNORE_STALENESS: "1", ...extra };
}

export function runNode(args: string[], cwd: string, timeoutMs = 120_000): SpawnSyncReturns<string> & { out: string } {
  const r = spawnSync(process.execPath, args, { cwd, encoding: "utf8", env: childEnv(), timeout: timeoutMs });
  return Object.assign(r, { out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` });
}

export function runCli(args: string[], cwd: string, timeoutMs = 120_000) {
  return runNode([cliDist, ...args], cwd, timeoutMs);
}

/** The first ```ts/```typescript block after a Markdown heading, verbatim. */
export function codeBlockAfter(markdownPath: string, heading: string): string {
  const lines = fs.readFileSync(markdownPath, "utf8").split(/\r?\n/);
  const h = lines.findIndex((l) => l.trim() === heading);
  if (h < 0) throw new Error(`heading not found in ${markdownPath}: ${heading}`);
  const start = lines.findIndex((l, i) => i > h && /^```(ts|typescript)\s*$/.test(l.trim()));
  if (start < 0) throw new Error(`no TypeScript block after ${heading}`);
  const end = lines.findIndex((l, i) => i > start && l.trim() === "```");
  return lines.slice(start + 1, end).join("\n") + "\n";
}
