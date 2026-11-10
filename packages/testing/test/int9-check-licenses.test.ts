import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// INT9 · D2: scripts/check-licenses.mjs on a fixture workspace (its own lockfile and node_modules), offline. It must
// fail when a published package REQUIRES a GPL/AGPL/LGPL or unknown license, list (and pass) one that is only an
// optional dependency or an optional peer, treat "MIT OR GPL" as not copyleft, refuse a node_modules that is not the
// lockfile's, and refuse a report made from another lockfile.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = path.join(ROOT, "scripts", "check-licenses.mjs");

let ws: string;

interface Dep {
  name: string;
  version: string;
  license?: string | undefined;
  deps?: Record<string, string>;
}

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2));
}

/**
 * One published package `@fx/a` (and a private one, `@fx/hidden`) with the given direct dependencies; each third-party
 * package is installed nested under packages/a/node_modules, as Node resolves it.
 */
function fixture(opts: {
  deps?: Dep[];
  optional?: Dep[];
  peer?: Dep & { optional: boolean };
  transitive?: Dep[];
  ownLicense?: string;
  installedVersion?: Record<string, string>;
}) {
  const all = [...(opts.deps ?? []), ...(opts.optional ?? []), ...(opts.peer ? [opts.peer] : []), ...(opts.transitive ?? [])];
  const manifest: Record<string, unknown> = {
    name: "@fx/a",
    version: "1.0.0",
    license: opts.ownLicense ?? "MIT",
    dependencies: Object.fromEntries((opts.deps ?? []).map((d) => [d.name, d.version])),
    optionalDependencies: Object.fromEntries((opts.optional ?? []).map((d) => [d.name, d.version]))
  };
  if (opts.peer) {
    manifest.peerDependencies = { [opts.peer.name]: opts.peer.version };
    manifest.peerDependenciesMeta = { [opts.peer.name]: { optional: opts.peer.optional } };
  }
  writeJson(path.join(ws, "packages", "a", "package.json"), manifest);
  writeJson(path.join(ws, "packages", "hidden", "package.json"), { name: "@fx/hidden", version: "1.0.0", private: true, license: "GPL-3.0", dependencies: {} });

  const section = (ds: Dep[] | undefined) => (ds ?? []).map((d) => `      ${d.name}:\n        specifier: ${d.version}\n        version: ${d.version}\n`).join("");
  let lock = "lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n\nimporters:\n\n  packages/a:\n";
  if (opts.deps?.length) lock += "    dependencies:\n" + section(opts.deps);
  if (opts.optional?.length) lock += "    optionalDependencies:\n" + section(opts.optional);
  if (opts.peer) lock += "    devDependencies:\n" + section([opts.peer]);
  lock += "\n  packages/hidden: {}\n\npackages:\n\n";
  for (const d of all) lock += `  ${d.name}@${d.version}:\n    resolution: {integrity: sha512-fixture}\n\n`;
  lock += "snapshots:\n\n";
  for (const d of all) {
    lock += d.deps && Object.keys(d.deps).length
      ? `  ${d.name}@${d.version}:\n    dependencies:\n${Object.entries(d.deps).map(([n, v]) => `      ${n}: ${v}\n`).join("")}\n`
      : `  ${d.name}@${d.version}: {}\n\n`;
  }
  writeFileSync(path.join(ws, "pnpm-lock.yaml"), lock);

  // node_modules: direct deps under packages/a; a transitive dep nested under the package that needs it
  const nm = path.join(ws, "packages", "a", "node_modules");
  const install = (dir: string, d: Dep) => {
    const m: Record<string, unknown> = { name: d.name, version: opts.installedVersion?.[d.name] ?? d.version };
    if (d.license !== undefined) m.license = d.license;
    writeJson(path.join(dir, d.name, "package.json"), m);
    for (const child of Object.keys(d.deps ?? {})) {
      const t = opts.transitive?.find((x) => x.name === child);
      if (t) install(path.join(dir, d.name, "node_modules"), t);
    }
  };
  for (const d of [...(opts.deps ?? []), ...(opts.optional ?? []), ...(opts.peer ? [opts.peer] : [])]) install(nm, d);
  mkdirSync(path.join(ws, "docs", "status"), { recursive: true });
}

function run(...extra: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, "--root", ws, ...extra], { encoding: "utf8", timeout: 60_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

/** --write, then the check itself. */
function writeAndCheck() {
  const w = run("--write");
  return { write: w, check: run() };
}

beforeEach(() => {
  ws = mkdtempSync(path.join(os.tmpdir(), "hardkas-int9-licenses-"));
});
afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
});

describe("INT9 · check-licenses on a fixture workspace", () => {
  it("MIT and ISC only, with a GPL optional peer installed: PASS, and the peer is listed as optional", () => {
    fixture({
      deps: [{ name: "dep-mit", version: "1.0.0", license: "MIT", deps: { "sub-isc": "2.0.0" } }],
      transitive: [{ name: "sub-isc", version: "2.0.0", license: "ISC" }],
      peer: { name: "gpl-peer", version: "0.7.6", license: "GPL-3.0", optional: true }
    });
    const { write, check } = writeAndCheck();
    expect(write.status, write.out).toBe(0);
    expect(check.status, check.out).toBe(0);
    expect(check.out).toContain("1 published packages, 3 third-party packages");
    expect(check.out).toMatch(/listed\s+gpl-peer@0\.7\.6 GPL-3\.0 \(copyleft, optional\)/);
    const report = readFileSync(path.join(ws, "docs", "status", "dependency-licenses.md"), "utf8");
    expect(report).toMatch(/\| `gpl-peer@0\.7\.6` \| GPL-3\.0 \| optional \| `@fx\/a` \|/);
    expect(report).toMatch(/\| `sub-isc` \| 2\.0\.0 \| ISC \| 1 \| 0 \|/);
    expect(report).not.toContain("@fx/hidden");
  });

  it("a GPL package REQUIRED transitively: FAIL with a VIOLATION that names the path", () => {
    fixture({
      deps: [{ name: "dep-mit", version: "1.0.0", license: "MIT", deps: { "sub-gpl": "3.0.0" } }],
      transitive: [{ name: "sub-gpl", version: "3.0.0", license: "GPL-3.0-only" }]
    });
    const { check } = writeAndCheck();
    expect(check.status).toBe(1);
    expect(check.out).toContain("VIOLATION @fx/a: sub-gpl@3.0.0 GPL-3.0-only (copyleft) via dep-mit > sub-gpl");
  });

  it.each([
    ["AGPL-3.0", "AGPL-3.0", 1],
    ["LGPL-2.1", "LGPL-2.1-or-later", 1],
    ["a required peer under GPL", "GPL-2.0", 1],
    ["no license field (unknown)", undefined, 1],
    ["UNLICENSED", "UNLICENSED", 1],
    ["MIT OR GPL-3.0 (dual: not copyleft)", "(MIT OR GPL-3.0)", 0],
    ["GPL-3.0 OR AGPL-3.0 (every alternative copyleft)", "GPL-3.0 OR AGPL-3.0", 1]
  ])("%s required directly", (name, license, expected) => {
    if (name.startsWith("a required peer")) fixture({ peer: { name: "dep-x", version: "1.0.0", license, optional: false } });
    else fixture({ deps: [{ name: "dep-x", version: "1.0.0", license }] });
    const { check } = writeAndCheck();
    expect(check.status, check.out).toBe(expected);
    if (expected === 1) expect(check.out).toContain("VIOLATION @fx/a: dep-x@1.0.0");
  });

  it("a GPL package that is only an optionalDependency: PASS, listed", () => {
    fixture({ optional: [{ name: "opt-gpl", version: "1.0.0", license: "GPL-3.0" }] });
    const { check } = writeAndCheck();
    expect(check.status, check.out).toBe(0);
    expect(check.out).toMatch(/listed\s+opt-gpl@1\.0\.0 GPL-3\.0 \(copyleft, optional\)/);
  });

  it("an optional dependency that is not installed here (a platform binary): PASS, its license not read", () => {
    fixture({ optional: [{ name: "opt-bin", version: "1.0.0", license: "MIT" }] });
    rmSync(path.join(ws, "packages", "a", "node_modules", "opt-bin"), { recursive: true });
    const { check } = writeAndCheck();
    expect(check.status, check.out).toBe(0);
    expect(check.out).toContain("1 optional packages are not installed on this platform");
  });

  it("a required dependency missing from node_modules, or at another version than the lockfile's: ERROR", () => {
    fixture({ deps: [{ name: "dep-mit", version: "1.0.0", license: "MIT" }], installedVersion: { "dep-mit": "1.0.1" } });
    expect(writeAndCheck().check.out).toContain("ERROR dep-mit: node_modules has 1.0.1, the lockfile says 1.0.0");
    rmSync(path.join(ws, "packages", "a", "node_modules", "dep-mit"), { recursive: true });
    const r = run();
    expect(r.status).toBe(1);
    expect(r.out).toContain("requires dep-mit@1.0.0 (via dep-mit), which is not in node_modules");
  });

  it("a published package whose own license is not MIT: VIOLATION", () => {
    fixture({ ownLicense: "Apache-2.0", deps: [{ name: "dep-mit", version: "1.0.0", license: "MIT" }] });
    const { check } = writeAndCheck();
    expect(check.status).toBe(1);
    expect(check.out).toContain("VIOLATION @fx/a: @fx/a Apache-2.0 (own license)");
  });

  it("a report made from another lockfile, or none at all: FAIL until --write", () => {
    fixture({ deps: [{ name: "dep-mit", version: "1.0.0", license: "MIT" }] });
    expect(run().out).toContain("dependency-licenses.md is missing");
    expect(writeAndCheck().check.status).toBe(0);
    writeFileSync(path.join(ws, "pnpm-lock.yaml"), readFileSync(path.join(ws, "pnpm-lock.yaml"), "utf8") + "\n# changed\n");
    const stale = run();
    expect(stale.status).toBe(1);
    expect(stale.out).toContain("was made from another pnpm-lock.yaml");
    // CRLF is not a change (a Windows checkout of the same lockfile)
    expect(writeAndCheck().check.status).toBe(0);
    writeFileSync(path.join(ws, "pnpm-lock.yaml"), readFileSync(path.join(ws, "pnpm-lock.yaml"), "utf8").replace(/\n/g, "\r\n"));
    expect(run().status).toBe(0);
  });
});
