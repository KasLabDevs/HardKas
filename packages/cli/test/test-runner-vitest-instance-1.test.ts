import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// TEST-RUNNER-VITEST-INSTANCE-1 (2026-10-23). Found running merchant-pos-demo on the release candidate in an isolated copy: its
// `hardkas test` scene ran no test ("Vitest failed to find the current suite"). The CLI is installed at the demo's root
// and started the vitest IT resolves; the demo's workspace (hardkas-workspace) has its own install, and @hardkas/testing
// (vitest is its peer) registers each scenario() on the WORKSPACE's vitest — another copy, another runner state, no
// suite. The same file run by the workspace's own vitest passes.
// Fixed: the runner starts the vitest the workspace resolves (`vitest/node` from the workspace root), and the CLI's own
// only when the workspace has none.
// The defect needs two copies of vitest, as two installs give: the workspace below gets its own copy of vitest and of
// the @vitest/* packages (the runner state lives in @vitest/runner), every other dependency linked to the installed one,
// and a package in its node_modules that registers tests through `import { it } from "vitest"`, like scenario() does.
// Every run is `hardkas test` as a real process on the built dist; the node ports are denied by the hermetic preload.
// -----------------------------------------------------------------------------

const scaffold =
  'export default { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } }, network: { allowPublic: false } };\n';
const HELPER_PKG = '{ "name": "ws-scenarios", "version": "1.0.0", "type": "module", "main": "./index.js" }\n';
const HELPER = 'import { it } from "vitest";\nexport const scenario = (name, fn) => it(name, fn);\n';
const SCENARIO =
  'import { scenario } from "ws-scenarios";\n' +
  'scenario("registers through the workspace\'s own vitest", () => {\n  if (1 + 1 !== 2) throw new Error("arithmetic");\n});\n';
const PLAIN = 'import { test, expect } from "vitest";\ntest("plain vitest test", () => { expect(1 + 1).toBe(2); });\n';

/** Where `name` resolves from `fromDir` by node_modules lookup (the real directory of the package). */
function findPackage(fromDir: string, name: string): string | undefined {
  for (let d = fromDir; ; d = path.dirname(d)) {
    const candidate = path.join(d, "node_modules", name, "package.json");
    if (fs.existsSync(candidate)) return fs.realpathSync(path.dirname(candidate));
    if (path.dirname(d) === d) return undefined;
  }
}

/** A second vitest in `nodeModules`: vitest and @vitest/* copied (their own module instances), the rest linked. */
function placeOwnVitest(nodeModules: string, vitestDir: string): void {
  const placed = new Set<string>();
  const place = (name: string, src: string) => {
    if (placed.has(name)) return;
    placed.add(name);
    const dest = path.join(nodeModules, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (name === "vitest" || name.startsWith("@vitest/")) {
      fs.cpSync(src, dest, { recursive: true, filter: (s) => path.basename(s) !== "node_modules" });
      const deps = Object.keys(JSON.parse(fs.readFileSync(path.join(src, "package.json"), "utf8")).dependencies ?? {});
      for (const dep of deps) {
        const at = findPackage(src, dep);
        if (at) place(dep, at);
      }
    } else {
      fs.symlinkSync(src, dest, "junction");
    }
  };
  place("vitest", vitestDir);
}

function workspace(root: string, name: string, files: Record<string, string>): string {
  const ws = path.join(root, name);
  fs.mkdirSync(path.join(ws, ".hardkas"), { recursive: true });
  fs.mkdirSync(path.join(ws, "test"), { recursive: true });
  fs.writeFileSync(path.join(ws, "package.json"), `{ "name": "${name}", "private": true, "type": "module" }\n`);
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), scaffold);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(ws, rel)), { recursive: true });
    fs.writeFileSync(path.join(ws, rel), text);
  }
  return ws;
}

let root: string;
let logs: string;
let own: string; // a workspace with its own vitest, tests registered through a package of its node_modules
let plain: string; // control: no vitest of its own
let cliVitest: string;
beforeAll(() => {
  assertHermeticPreloadActive();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-trvi1-"));
  logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-trvi1-logs-"));
  cliVitest = findPackage(path.dirname(cliDist), "vitest")!;
  own = workspace(root, "own-vitest", {
    "test/scenario.test.ts": SCENARIO,
    "node_modules/ws-scenarios/package.json": HELPER_PKG,
    "node_modules/ws-scenarios/index.js": HELPER
  });
  placeOwnVitest(path.join(own, "node_modules"), cliVitest);
  plain = workspace(root, "no-own-vitest", { "test/plain.test.ts": PLAIN });
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(logs, { recursive: true, force: true });
});

function hkTest(name: string, cwd: string, args: string[]) {
  const r = spawnSync(process.execPath, [cliDist, "test", ...args], {
    cwd,
    encoding: "utf8",
    env: hermeticChildEnv(path.join(logs, `${name}.net.log`), { HARDKAS_HERMETIC_DENY_PORTS: "16210,17210,18210" }),
    timeout: 200_000
  });
  let doc: any;
  try {
    doc = JSON.parse((r.stdout ?? "").trim());
  } catch {
    doc = undefined;
  }
  let fileMessages = "";
  try {
    const report = JSON.parse(fs.readFileSync(path.join(cwd, ".hardkas", "runs", doc.result.testRunId, "vitest-report.json"), "utf8"));
    fileMessages = (report.testResults ?? []).map((t: any) => String(t.message ?? "")).join(" | ");
  } catch {
    // no runner report
  }
  const brief = `exit ${r.status}\nstdout: ${(r.stdout ?? "").slice(0, 1500)}\nstderr: ${(r.stderr ?? "").slice(0, 900)}\nfile messages: ${fileMessages.slice(0, 600)}`;
  return { status: r.status, doc, result: doc?.result, fileMessages, brief };
}

describe("TEST-RUNNER-VITEST-INSTANCE-1 · `hardkas test` runs the workspace's tests on the workspace's own vitest", () => {
  it("V-0 the layout really holds a second vitest: another directory, its own @vitest/runner", () => {
    const wsVitest = findPackage(own, "vitest")!;
    expect(fs.realpathSync(wsVitest)).not.toBe(fs.realpathSync(cliVitest));
    const wsRunner = findPackage(wsVitest, "@vitest/runner")!;
    const cliRunner = findPackage(cliVitest, "@vitest/runner")!;
    expect(fs.realpathSync(wsRunner)).not.toBe(fs.realpathSync(cliRunner));
  });

  it("V-1 tests registered through the workspace's vitest are executed and pass", () => {
    const r = hkTest("v1", own, ["--json"]);
    expect(r.fileMessages, r.brief).not.toMatch(/failed to find the current suite/i);
    expect(r.doc?.ok, r.brief).toBe(true);
    expect(r.result?.verdict, r.brief).toBe("PASS");
    expect(r.result?.tests?.executed, r.brief).toBe(1);
    expect(r.result?.tests?.passed, r.brief).toBe(1);
  });

  it("V-2 control: a workspace without a vitest of its own still runs on the CLI's", () => {
    const r = hkTest("v2", plain, ["--json"]);
    expect(r.doc?.ok, r.brief).toBe(true);
    expect(r.result?.verdict, r.brief).toBe("PASS");
    expect(r.result?.tests?.executed, r.brief).toBe(1);
  });

  it("V-3 the run report keeps its shape: the same fields either way, the run's facts on disk", () => {
    const a = hkTest("v3a", own, ["--json"]);
    const b = hkTest("v3b", plain, ["--json"]);
    expect(Object.keys(a.result ?? {}).sort(), a.brief).toEqual(Object.keys(b.result ?? {}).sort());
    for (const [r, cwd] of [[a, own], [b, plain]] as const) {
      const dir = path.join(cwd, ".hardkas", "runs", r.result.testRunId);
      const onDisk = JSON.parse(fs.readFileSync(path.join(dir, "test-results.json"), "utf8"));
      expect(onDisk.verdict, r.brief).toBe(r.result.verdict);
      expect(onDisk.tests, r.brief).toEqual(r.result.tests);
      expect(fs.existsSync(path.join(dir, "vitest-report.json")), r.brief).toBe(true);
    }
  });
});
