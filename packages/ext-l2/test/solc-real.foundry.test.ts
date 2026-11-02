import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import type { AddressInfo } from "node:net";
import { installL2Extension, removeProject, cliIn } from "./helpers/installed-l2.js";
import { foundryReferenceFor, isMusl } from "../src/toolchains/foundry.js";
import { solcReferenceFor, SOLC_LONG_VERSION } from "../src/toolchains/solc.js";
import { forgeEnv } from "../src/compile/forge-build.js";
import { repoRoot } from "../../cli/test/first-contact-helpers.js";

// L2-EXT stage 5 · `hardkas l2 compile` with the REAL pinned forge (vitest.foundry.config.ts; HARDKAS_FOUNDRY_ASSETS as in
// foundry-real). The part that compiles needs the real solc 0.8.38 asset (HARDKAS_SOLC_ASSETS = a directory with
// <platform>/<assetName>); without it that part is skipped and says so. forge is never run without --offline here:
// if it ignored the proxies it could fetch a compiler, and no download is authorized from a test.
//
// Where forge would put a fetched compiler (svm): every run gets private data directories (APPDATA / LOCALAPPDATA on
// Windows, HOME / XDG_DATA_HOME elsewhere; USERPROFILE is left alone: without it svm-rs panics before doing anything),
// and the user's real svm locations are listed before and after (read only). The tests require that nothing appears.

const FOUNDRY_ASSETS = process.env.HARDKAS_FOUNDRY_ASSETS;
if (!FOUNDRY_ASSETS) throw new Error("HARDKAS_FOUNDRY_ASSETS is not set: this suite needs the verified Foundry release asset on disk");
const SOLC_ASSETS = process.env.HARDKAS_SOLC_ASSETS;
const key = `${process.platform}-${process.arch}`;
const foundry = foundryReferenceFor(process.platform, process.arch, isMusl());
const solc = solcReferenceFor(process.platform, process.arch, isMusl());
if (!foundry || !solc) throw new Error(`no Foundry/solc pin for ${key}: run this suite on win32-x64 or glibc linux-x64`);
const foundryAsset = path.join(FOUNDRY_ASSETS, key, foundry.assetName);
const solcAsset = SOLC_ASSETS ? path.join(SOLC_ASSETS, key, solc.assetName) : undefined;
const PRELOAD = path.join(repoRoot, "scripts", "hermetic", "no-network-preload.cjs").split(path.sep).join("/");
const RECORDER = pathToFileURL(path.join(repoRoot, "packages", "cli", "test", "fixtures", "module-recorder.mjs")).href;

let parent: string;
let home: string;
let userDirs: Record<string, string>;
let ws: string;
let project: string;
let links: string[] = [];
let projectLinks: string[] = [];

function run(cwd: string, args: string[], name: string) {
  const net = path.join(parent, `${name}.net.log`);
  const r = cliIn(cwd, args, name, {
    HARDKAS_HOME: home,
    HARDKAS_HERMETIC_LOG: net,
    NODE_OPTIONS: `--require="${PRELOAD}" --import=${RECORDER}`,
    ...userDirs
  });
  const refused = fs.existsSync(net) ? fs.readFileSync(net, "utf8").split(/\r?\n/).filter((l) => /REFUSED/.test(l)) : [];
  const envelope = r.stdout
    .split(/\r?\n(?=\{)/)
    .map((c) => {
      try {
        return JSON.parse(c);
      } catch {
        return undefined;
      }
    })
    .find((d) => d && typeof d.ok === "boolean");
  return { ...r, refused, envelope };
}

const REAL_SVM = [path.join(os.homedir(), ".svm"), path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "svm"), path.join(os.homedir(), ".local", "share", "svm")];
const listing = (d: string): string[] => {
  const out: string[] = [];
  const walk = (x: string) => {
    if (!fs.existsSync(x)) return;
    for (const e of fs.readdirSync(x, { withFileTypes: true })) {
      out.push(path.join(x, e.name));
      if (e.isDirectory()) walk(path.join(x, e.name));
    }
  };
  walk(d);
  return out;
};
let realSvmBefore: string[] = [];

/** Compiler traces: anything svm/solc-like in the private data directories, and any change to the real svm stores. */
function compilerTraces(): string[] {
  const found: string[] = [];
  for (const d of new Set(Object.values(userDirs))) found.push(...listing(d).filter((p) => /svm|solc/i.test(path.basename(p))));
  const realNow = REAL_SVM.flatMap(listing);
  found.push(...realNow.filter((p) => !realSvmBefore.includes(p)).map((p) => `NEW in the user's svm store: ${p}`));
  return found;
}

beforeAll(() => {
  if (!fs.existsSync(foundryAsset)) throw new Error(`missing ${foundryAsset}`);
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-solc-real-"));
  home = path.join(parent, "hardkas-home");
  const user = path.join(parent, "user");
  userDirs =
    process.platform === "win32"
      ? { APPDATA: path.join(user, "AppData", "Roaming"), LOCALAPPDATA: path.join(user, "AppData", "Local") }
      : { HOME: user, XDG_DATA_HOME: path.join(user, ".local", "share") };
  realSvmBefore = REAL_SVM.flatMap(listing);
  for (const d of [home, ...Object.values(userDirs)]) fs.mkdirSync(d, { recursive: true });
  ws = path.join(parent, "ws");
  fs.mkdirSync(ws);
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {};\n");
  links = installL2Extension(ws);
  const created = run(ws, ["create", "l2-evm", "app", "--json"], "create");
  if (created.json?.ok !== true) throw new Error(`create l2-evm failed: ${created.stdout}${created.stderr}`);
  project = path.join(ws, "app");
  projectLinks = installL2Extension(project);
  const inst = run(ws, ["toolchain", "install", "foundry", "--from-file", foundryAsset, "--json"], "install-foundry");
  if (inst.json?.status !== "TOOLCHAIN_INSTALLED") throw new Error(`foundry install failed: ${inst.stdout}${inst.stderr}`);
}, 600_000);

afterAll(() => {
  if (!parent) return;
  for (const l of projectLinks) fs.rmSync(l, { force: true });
  removeProject(ws, links);
  fs.rmSync(parent, { recursive: true, force: true });
});

describe("l2 compile with the real forge 1.8.6, no solc installed", () => {
  it("TOOLCHAIN_NOT_INSTALLED naming `hardkas toolchain install solc`; nothing compiled; no compiler fetched; no network", { timeout: 300_000 }, () => {
    const r = run(project, ["l2", "compile", "--json"], "compile-nosolc");
    expect({ status: r.status, code: r.envelope?.code }, r.stdout + r.stderr).toMatchObject({ status: 1, code: "TOOLCHAIN_NOT_INSTALLED" });
    expect(r.envelope.message).toContain("hardkas toolchain install solc");
    expect(fs.existsSync(path.join(project, "out"))).toBe(false);
    expect(compilerTraces()).toEqual([]);
    expect(r.refused).toEqual([]);
  });

  it("forge itself, offline and without a compiler: fails, makes no request (recording proxy) and installs no compiler", { timeout: 300_000 }, async () => {
    const requests: string[] = [];
    const proxy = http.createServer((req, res) => {
      requests.push(`${req.method} ${req.url}`);
      res.statusCode = 403;
      res.end();
    });
    proxy.on("connect", (req, socket) => {
      requests.push(`CONNECT ${req.url}`);
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    });
    await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", () => r()));
    const proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    try {
      const { getToolchainInstallDir } = await import("@hardkas/core");
      const forgeBin = path.join(getToolchainInstallDir(foundry, home), process.platform === "win32" ? "forge.exe" : "forge");
      // the project's own settings, and then a foundry.toml that asks for auto-detection and another compiler
      const env = { ...forgeEnv({ ...process.env, ...userDirs }), HTTP_PROXY: proxyUrl, HTTPS_PROXY: proxyUrl, ALL_PROXY: proxyUrl, http_proxy: proxyUrl, https_proxy: proxyUrl, all_proxy: proxyUrl };
      const toml = path.join(project, "foundry.toml");
      const original = fs.readFileSync(toml, "utf8");
      try {
        const hostile = original.replace("offline = true", "offline = false").replace("auto_detect_solc = false", "auto_detect_solc = true").replace('solc_version = "0.8.38"', 'solc_version = "0.8.19"');
        for (const [variant, version] of [[original, "0.8.38"], [hostile, "0.8.19"]] as const) {
          fs.writeFileSync(toml, variant);
          const r = spawnSync(forgeBin, ["build", "--root", project, "--offline"], { env, encoding: "utf8", timeout: 240_000 });
          // it fails for the right reason: forge itself refuses to fetch the compiler (not a crash, not a bad argument)
          expect({ status: r.status, out: (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, "") }).toMatchObject({
            status: 1,
            out: expect.stringContaining(`can't install missing solc ${version} in offline mode`)
          });
        }
      } finally {
        fs.writeFileSync(toml, original);
      }
      expect(requests).toEqual([]);
      expect(compilerTraces()).toEqual([]);
      expect(fs.existsSync(path.join(project, "out"))).toBe(false);
    } finally {
      await new Promise<void>((r) => proxy.close(() => r()));
    }
  });
});

describe.skipIf(!solcAsset)(`l2 compile with the real solc ${SOLC_LONG_VERSION} (HARDKAS_SOLC_ASSETS)`, () => {
  beforeAll(() => {
    if (!fs.existsSync(solcAsset!)) throw new Error(`missing ${solcAsset}`);
    const r = run(ws, ["toolchain", "install", "solc", "--from-file", solcAsset!, "--json"], "install-solc");
    if (r.json?.status !== "TOOLCHAIN_INSTALLED") throw new Error(`solc install failed: ${r.stdout}${r.stderr}`);
  }, 300_000);

  const manifestOf = () => JSON.parse(fs.readFileSync(path.join(project, ".hardkas", "l2-build.json"), "utf8"));

  it("compiles the template offline: Counter and its test, by the pinned solc, evm cancun; no compiler fetched; no network", { timeout: 300_000 }, () => {
    const r = run(project, ["l2", "compile", "--json"], "compile");
    expect(r.envelope?.ok, r.stdout + r.stderr).toBe(true);
    const m = manifestOf();
    const names = Object.keys(m.contracts);
    expect(names).toEqual(expect.arrayContaining(["src/Counter.sol:Counter", "test/Counter.t.sol:CounterTest"]));
    // forge 1.8.6 also compiles a helper it injects into test files (VmContractHelper<n>); nothing from anywhere else
    expect(names.filter((n) => !["src/Counter.sol:Counter", "test/Counter.t.sol:CounterTest"].includes(n)).every((n) => /^test\/Counter\.t\.sol:VmContractHelper\d+$/.test(n))).toBe(true);
    expect(m).toMatchObject({ schema: "hardkas.l2Build.v1", solc: { version: SOLC_LONG_VERSION, sha256: solc.assetSha256 }, evmVersions: ["cancun"] });
    expect(fs.existsSync(path.join(project, "out", "Counter.sol", "Counter.json"))).toBe(true);
    expect(compilerTraces()).toEqual([]);
    expect(r.refused).toEqual([]);
  });

  it("--check: the rebuild in a temporary directory has identical bytecode", { timeout: 300_000 }, () => {
    const r = run(project, ["l2", "compile", "--check", "--json"], "check");
    expect(r.envelope, r.stdout + r.stderr).toMatchObject({ ok: true, result: { reproducible: true, contracts: Object.keys(manifestOf().contracts).length } });
  });

  it("a changed compiler setting after the recorded build: --check fails with L2_BUILD_NOT_REPRODUCIBLE naming what differs", { timeout: 300_000 }, () => {
    const toml = path.join(project, "foundry.toml");
    const original = fs.readFileSync(toml, "utf8");
    try {
      fs.writeFileSync(toml, original.replace("optimizer_runs = 200", "optimizer_runs = 1"));
      const r = run(project, ["l2", "compile", "--check", "--json"], "check-drift");
      expect({ status: r.status, code: r.envelope?.code }, r.stdout + r.stderr).toMatchObject({ code: "L2_BUILD_NOT_REPRODUCIBLE" });
      expect(r.status).not.toBe(0);
      expect(r.envelope.message).toMatch(/src\/Counter\.sol:Counter: (creation|runtime) bytecode differs/);
    } finally {
      fs.writeFileSync(toml, original);
    }
  });

  it("a foundry.toml that asks for auto-detection and another compiler still compiles with the pinned solc, fetching nothing", { timeout: 300_000 }, () => {
    const toml = path.join(project, "foundry.toml");
    const original = fs.readFileSync(toml, "utf8");
    try {
      fs.writeFileSync(toml, original.replace("offline = true", "offline = false").replace("auto_detect_solc = false", "auto_detect_solc = true").replace('solc_version = "0.8.38"', 'solc_version = "0.8.19"'));
      const r = run(project, ["l2", "compile", "--json"], "compile-hostile-toml");
      expect(r.envelope?.ok, r.stdout + r.stderr).toBe(true);
      expect(manifestOf().solc.version).toBe(SOLC_LONG_VERSION);
      expect(compilerTraces()).toEqual([]);
    } finally {
      fs.writeFileSync(toml, original);
    }
  });

  /** out/ and the build record, to show a refused or failed build left the last good one as it was. */
  const buildState = () => ({
    manifest: fs.readFileSync(path.join(project, ".hardkas", "l2-build.json"), "utf8"),
    counter: fs.readFileSync(path.join(project, "out", "Counter.sol", "Counter.json"), "utf8")
  });

  it("a source that pins another compiler: L2_COMPILE_FAILED (no download of that compiler); the last good build is kept", { timeout: 300_000 }, () => {
    expect(run(project, ["l2", "compile", "--json"], "compile-before-other-pragma").envelope?.ok).toBe(true);
    const before = buildState();
    const extra = path.join(project, "src", "Old.sol");
    fs.writeFileSync(extra, "// SPDX-License-Identifier: MIT\npragma solidity =0.8.20;\ncontract Old {}\n");
    try {
      const r = run(project, ["l2", "compile", "--json"], "compile-other-pragma");
      expect({ code: r.envelope?.code }, r.stdout + r.stderr).toMatchObject({ code: "L2_COMPILE_FAILED" });
      expect(r.status).not.toBe(0);
      expect(compilerTraces()).toEqual([]);
      expect(buildState()).toEqual(before);
      expect(fs.readdirSync(path.join(project, ".hardkas")).filter((n) => n.startsWith("l2-build-staging-"))).toEqual([]);
    } finally {
      fs.rmSync(extra);
    }
  });

  it.each([
    ["solc", () => solc.entry],
    ["foundry", () => (process.platform === "win32" ? "forge.exe" : "forge")]
  ])("an altered installed %s (one byte): TOOLCHAIN_VERIFY_FAILED naming the --force reinstall; nothing compiled", { timeout: 300_000 }, async (id, file) => {
    const { getToolchainInstallDir } = await import("@hardkas/core");
    const ref = id === "solc" ? solc : foundry;
    expect(run(project, ["l2", "compile", "--json"], `compile-before-altered-${id}`).envelope?.ok).toBe(true);
    const before = buildState();
    const target = path.join(getToolchainInstallDir(ref, home), file());
    const original = fs.readFileSync(target);
    const changed = Buffer.from(original);
    changed[changed.length - 5] ^= 0x01;
    fs.writeFileSync(target, changed);
    try {
      const r = run(project, ["l2", "compile", "--json"], `compile-altered-${id}`);
      expect({ code: r.envelope?.code }, r.stdout + r.stderr).toMatchObject({ code: "TOOLCHAIN_VERIFY_FAILED" });
      expect(r.envelope.message).toContain(`hardkas toolchain install ${id} --force`);
      expect(buildState()).toEqual(before);
    } finally {
      fs.writeFileSync(target, original);
    }
  });
});
