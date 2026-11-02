import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { HardkasCliError, HardkasExitCode } from "@hardkas/cli/extension-kit";
import { SOLC_LONG_VERSION } from "../toolchains/solc.js";
import type { VerifiedToolchain } from "../toolchains/verified.js";

/**
 * L2-EXT stage 5 · `hardkas l2 compile`: the pinned forge compiles with the pinned solc, offline.
 *
 * Nothing may be fetched while compiling:
 *   - forge gets `--offline` and `--use <the verified solc>` on the command line, which win over foundry.toml (a project
 *     that asks for another compiler, or for auto-detection, cannot make forge download one);
 *   - every inherited FOUNDRY_* / DAPP_* variable is dropped (they could re-enable auto-detection or point elsewhere),
 *     and the HTTP(S) proxies point at a closed loopback port, so a connection forge might still try goes nowhere;
 *   - the compiler that really ran is read back from every artifact's metadata and must be the pinned one.
 *
 * Reproducibility: the build writes `.hardkas/l2-build.json` with the SHA-256 of every contract's creation and runtime
 * bytecode; `--check` rebuilds into a temporary directory and compares.
 */

export const L2_BUILD_SCHEMA = "hardkas.l2Build.v1";
/** A loopback port nothing listens on (TCP discard): any proxied connection is refused locally. */
export const OFFLINE_PROXY = "http://127.0.0.1:9";

export interface L2ContractBuild {
  readonly bytecodeSha256: string;
  readonly deployedBytecodeSha256: string;
  /** F-05 (independent audit) · the SHA-256 of the contract's canonical ABI (see abiSha256). */
  readonly abiSha256: string;
}

/** Canonical JSON: object keys sorted at every depth, array order kept (an ABI's entry order is the compiler's). */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/** The digest an ABI is bound to the build with. */
export function abiSha256(abi: unknown): string {
  return sha256(canonicalJson(abi));
}

export interface L2BuildManifest {
  readonly schema: typeof L2_BUILD_SCHEMA;
  readonly solc: { readonly version: string; readonly sha256: string };
  readonly forge: { readonly version: string; readonly sha256: string };
  readonly evmVersions: readonly string[];
  readonly contracts: Readonly<Record<string, L2ContractBuild>>;
}

export function l2BuildManifestPath(root: string): string {
  return path.join(root, ".hardkas", "l2-build.json");
}

/** A JSON file the workspace keeps (a BOM, as Windows editors write it, is tolerated), or undefined if it does not parse. */
export function readWorkspaceJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch {
    return undefined;
  }
}

const HASH64 = /^[0-9a-f]{64}$/;

/** F-04/F-05 · the build record, validated (schema, one digest set per contract, the ABI digest included). */
export function readL2BuildManifest(root: string): L2BuildManifest {
  const file = l2BuildManifestPath(root);
  if (!fs.existsSync(file)) {
    throw new HardkasCliError("L2_BUILD_MANIFEST_MISSING", `no verified build (${file}): run hardkas l2 compile first`, { exitCode: HardkasExitCode.USAGE_ERROR });
  }
  const m = readWorkspaceJson(file) as any;
  const invalid = (why: string) =>
    new HardkasCliError("L2_BUILD_MANIFEST_INVALID", `${file} is not a valid build record (${why}): run hardkas l2 compile again`, { exitCode: HardkasExitCode.CORRUPTION_DETECTED });
  if (!m || typeof m !== "object") throw invalid("not JSON");
  if (m.schema !== L2_BUILD_SCHEMA) throw invalid(`schema ${JSON.stringify(m.schema)}`);
  if (!m.contracts || typeof m.contracts !== "object" || Array.isArray(m.contracts)) throw invalid("no contracts");
  for (const [k, c] of Object.entries<any>(m.contracts)) {
    if (!c || !HASH64.test(c.bytecodeSha256) || !HASH64.test(c.deployedBytecodeSha256)) throw invalid(`${k}: bytecode digests`);
    if (!HASH64.test(c.abiSha256)) throw invalid(`${k}: no ABI digest (a record from before the ABI was bound to the build)`);
  }
  if (!Array.isArray(m.evmVersions) || !m.solc || typeof m.solc.sha256 !== "string" || !m.forge || typeof m.forge.sha256 !== "string") throw invalid("toolchain fields");
  return m as L2BuildManifest;
}

/** The environment forge runs with: the caller's, minus every Foundry override, plus offline and dead proxies. */
export function forgeEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(base)) {
    if (/^(FOUNDRY_|DAPP_)/i.test(k)) continue;
    if (/^(https?_proxy|all_proxy|no_proxy)$/i.test(k)) continue;
    env[k] = v;
  }
  return {
    ...env,
    FOUNDRY_OFFLINE: "true",
    HTTP_PROXY: OFFLINE_PROXY,
    HTTPS_PROXY: OFFLINE_PROXY,
    ALL_PROXY: OFFLINE_PROXY,
    http_proxy: OFFLINE_PROXY,
    https_proxy: OFFLINE_PROXY,
    all_proxy: OFFLINE_PROXY,
    NO_PROXY: "",
    no_proxy: ""
  };
}

/** forge build's arguments: offline, the verified solc, explicit output and cache directories. */
export function forgeBuildArgs(root: string, solcPath: string, outDir: string, cacheDir: string): string[] {
  return ["build", "--root", root, "--offline", "--use", solcPath, "--out", outDir, "--cache-path", cacheDir, "--force"];
}

function run(file: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

/** Like run(), but stdout only (stderr is not mixed into a machine-readable answer). */
function runStdout(file: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { env, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Every compiled contract of a forge output directory, keyed `source:Contract`, with the compiler that built it. */
export function collectContracts(outDir: string): { contracts: Record<string, L2ContractBuild>; compilers: Set<string>; evmVersions: Set<string> } {
  const contracts: Record<string, L2ContractBuild> = {};
  const compilers = new Set<string>();
  const evmVersions = new Set<string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "build-info") walk(p);
        continue;
      }
      if (!e.name.endsWith(".json")) continue;
      const a = JSON.parse(fs.readFileSync(p, "utf8"));
      const meta = typeof a.metadata === "string" ? JSON.parse(a.metadata) : a.metadata;
      const target = meta?.settings?.compilationTarget as Record<string, string> | undefined;
      if (!target || !a.bytecode || !a.deployedBytecode) continue;
      const [source, name] = Object.entries(target)[0]!;
      if (meta?.compiler?.version) compilers.add(String(meta.compiler.version));
      if (meta?.settings?.evmVersion) evmVersions.add(String(meta.settings.evmVersion));
      contracts[`${source}:${name}`] = {
        bytecodeSha256: sha256(String(a.bytecode.object ?? "")),
        deployedBytecodeSha256: sha256(String(a.deployedBytecode.object ?? "")),
        abiSha256: abiSha256(a.abi ?? [])
      };
    }
  };
  if (fs.existsSync(outDir)) walk(outDir);
  return { contracts, compilers, evmVersions };
}

/** Every artifact must have been built by the pinned solc (read back from its metadata), or L2_COMPILER_MISMATCH. */
export function assertPinnedCompiler(compilers: ReadonlySet<string>): void {
  const foreign = [...compilers].filter((c) => c !== SOLC_LONG_VERSION);
  if (foreign.length > 0 || compilers.size === 0) {
    throw new HardkasCliError("L2_COMPILER_MISMATCH", `artifacts built by ${foreign.join(", ") || "an unrecorded compiler"}, not the pinned solc ${SOLC_LONG_VERSION}`, {
      exitCode: HardkasExitCode.CORRUPTION_DETECTED
    });
  }
}

export interface CompileTools {
  readonly forge: VerifiedToolchain;
  readonly solc: VerifiedToolchain;
}

/** One offline forge build of `root` into `outDir`; returns the manifest of what it produced. */
export async function forgeBuild(root: string, tools: CompileTools, outDir: string, cacheDir: string, opts: { timeoutMs?: number } = {}): Promise<L2BuildManifest> {
  const forgePath = tools.forge.bin(process.platform === "win32" ? "forge.exe" : "forge");
  const solcPath = tools.solc.bin(tools.solc.ref.entry);
  let r: { code: number | null; out: string };
  try {
    r = await run(forgePath, forgeBuildArgs(root, solcPath, outDir, cacheDir), forgeEnv(), opts.timeoutMs ?? 10 * 60_000);
  } catch (e: any) {
    throw new HardkasCliError("L2_COMPILE_FAILED", `forge could not be started: ${e?.message ?? String(e)}`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
  }
  if (r.code !== 0) {
    throw new HardkasCliError("L2_COMPILE_FAILED", `forge build failed (exit ${r.code}):\n${r.out.trim().split(/\r?\n/).slice(-25).join("\n")}`, {
      exitCode: HardkasExitCode.RUNTIME_FAILURE
    });
  }
  const { contracts, compilers, evmVersions } = collectContracts(outDir);
  if (Object.keys(contracts).length === 0) {
    throw new HardkasCliError("L2_COMPILE_FAILED", `forge build produced no contract under ${outDir}`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
  }
  assertPinnedCompiler(compilers);
  const forgeName = process.platform === "win32" ? "forge.exe" : "forge";
  return {
    schema: L2_BUILD_SCHEMA,
    solc: { version: SOLC_LONG_VERSION, sha256: tools.solc.ref.files[tools.solc.ref.entry]!.sha256 },
    forge: { version: tools.forge.ref.version, sha256: tools.forge.ref.files[forgeName]!.sha256 },
    evmVersions: [...evmVersions].sort(),
    contracts: Object.fromEntries(Object.entries(contracts).sort(([a], [b]) => a.localeCompare(b)))
  };
}

/** What differs between a recorded build and a rebuild (empty when identical). */
export function compareBuilds(recorded: L2BuildManifest, rebuilt: L2BuildManifest): string[] {
  const diffs: string[] = [];
  if (recorded.solc.sha256 !== rebuilt.solc.sha256) diffs.push(`solc: ${recorded.solc.version} → ${rebuilt.solc.version}`);
  if (recorded.forge.sha256 !== rebuilt.forge.sha256) diffs.push(`forge: ${recorded.forge.version} → ${rebuilt.forge.version}`);
  if (JSON.stringify(recorded.evmVersions) !== JSON.stringify(rebuilt.evmVersions)) {
    diffs.push(`evm version: ${recorded.evmVersions.join(",")} → ${rebuilt.evmVersions.join(",")}`);
  }
  const names = new Set([...Object.keys(recorded.contracts), ...Object.keys(rebuilt.contracts)]);
  for (const n of [...names].sort()) {
    const a = recorded.contracts[n];
    const b = rebuilt.contracts[n];
    if (!a) diffs.push(`${n}: not in the recorded build`);
    else if (!b) diffs.push(`${n}: missing from the rebuild`);
    else {
      if (a.bytecodeSha256 !== b.bytecodeSha256) diffs.push(`${n}: creation bytecode differs`);
      if (a.deployedBytecodeSha256 !== b.deployedBytecodeSha256) diffs.push(`${n}: runtime bytecode differs`);
      if (a.abiSha256 !== b.abiSha256) diffs.push(`${n}: ABI differs`);
    }
  }
  return diffs;
}

/**
 * `hardkas l2 compile`: build into a staging directory and, only when the build succeeded and passed its checks, swap
 * it in as out/ and record the manifest. A failed build leaves the previous out/ and its manifest as they were (forge
 * --force clears its output directory first, so building in place would lose the last good build).
 */
export async function compileProject(root: string, tools: CompileTools): Promise<{ manifest: L2BuildManifest; manifestPath: string }> {
  const manifestPath = l2BuildManifestPath(root);
  await fsp.mkdir(path.dirname(manifestPath), { recursive: true });
  const staging = await fsp.mkdtemp(path.join(path.dirname(manifestPath), "l2-build-staging-"));
  try {
    const manifest = await forgeBuild(root, tools, path.join(staging, "out"), path.join(staging, "cache"));
    const out = path.join(root, "out");
    await fsp.rm(out, { recursive: true, force: true });
    await fsp.rename(path.join(staging, "out"), out);
    const tmp = `${manifestPath}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(manifest, null, 2) + "\n");
    await fsp.rename(tmp, manifestPath);
    return { manifest, manifestPath };
  } finally {
    await fsp.rm(staging, { recursive: true, force: true });
  }
}

/**
 * `hardkas l2 test` (L2-EXT stage 6): forge's own Solidity tests, run by the verified forge with the verified solc,
 * offline, in forge's in-process EVM (no node, no network). Output and cache go to a temporary directory.
 */
export async function forgeTest(
  root: string,
  tools: CompileTools,
  opts: { match?: string | undefined; timeoutMs?: number | undefined; allowFfi?: boolean | undefined } = {}
): Promise<{ passed: boolean; summary: string; output: string; ffi: boolean }> {
  const forgePath = tools.forge.bin(process.platform === "win32" ? "forge.exe" : "forge");
  // F-02 (independent audit): a project whose effective Foundry config enables FFI lets its tests run any command
  // (vm.ffi). FOUNDRY_FFI=false does not override `ffi = true` in foundry.toml, so the decision is taken on forge's own
  // resolved configuration (profiles, inheritance and overrides included), computed with the same environment and
  // profile `forge test` runs with. FFI is refused unless the caller passed --allow-ffi.
  const config = await forgeEffectiveConfig(root, tools);
  if (typeof config.ffi !== "boolean") {
    throw new HardkasCliError("L2_FOUNDRY_CONFIG_INVALID", `forge config does not report a boolean ffi setting (${JSON.stringify(config.ffi)}); no test was run`, {
      exitCode: HardkasExitCode.CORRUPTION_DETECTED
    });
  }
  if (config.ffi && !opts.allowFfi) {
    throw new HardkasCliError(
      "L2_FFI_NOT_ALLOWED",
      "this project's Foundry configuration enables FFI (ffi = true): its tests could run arbitrary commands on this machine. No test was run. If you trust the project, run: hardkas l2 test --allow-ffi",
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "hk-l2-test-"));
  try {
    const args = ["test", "--root", root, "--offline", "--use", tools.solc.bin(tools.solc.ref.entry), "--out", path.join(tmp, "out"), "--cache-path", path.join(tmp, "cache")];
    if (opts.match) args.push("--match-test", opts.match);
    let r: { code: number | null; out: string };
    try {
      r = await run(forgePath, args, forgeEnv(), opts.timeoutMs ?? 10 * 60_000);
    } catch (e: any) {
      throw new HardkasCliError("L2_TEST_FAILED", `forge could not be started: ${e?.message ?? String(e)}`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
    }
    const clean = r.out.replace(/\x1b\[[0-9;]*m/g, "");
    const summary = clean.split(/\r?\n/).filter((l) => /Ran \d+ test suites?|tests? passed|failed/i.test(l)).pop() ?? "";
    return { passed: r.code === 0, summary: summary.trim(), output: clean, ffi: config.ffi as boolean };
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
}

/** forge's resolved configuration for `root` (`forge config --json`), with the environment forge test runs with. */
export async function forgeEffectiveConfig(root: string, tools: CompileTools, timeoutMs = 120_000): Promise<Record<string, unknown>> {
  const forgePath = tools.forge.bin(process.platform === "win32" ? "forge.exe" : "forge");
  let r: { code: number | null; out: string };
  try {
    r = await runStdout(forgePath, ["config", "--root", root, "--json"], forgeEnv(), timeoutMs);
  } catch (e: any) {
    throw new HardkasCliError("L2_FOUNDRY_CONFIG_INVALID", `forge config could not be started: ${e?.message ?? String(e)}`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
  }
  let parsed: unknown;
  try {
    parsed = r.code === 0 ? JSON.parse(r.out) : undefined;
  } catch {
    parsed = undefined;
  }
  if (!parsed || typeof parsed !== "object") {
    throw new HardkasCliError("L2_FOUNDRY_CONFIG_INVALID", `forge could not resolve this project's configuration (exit ${r.code}); no test was run`, {
      exitCode: HardkasExitCode.USAGE_ERROR
    });
  }
  return parsed as Record<string, unknown>;
}

/** `hardkas l2 compile --check`: rebuild in a temporary directory and compare with the recorded manifest. */
export async function checkReproducible(root: string, tools: CompileTools): Promise<{ recorded: L2BuildManifest; rebuilt: L2BuildManifest; differences: string[] }> {
  const manifestPath = l2BuildManifestPath(root);
  if (!fs.existsSync(manifestPath)) {
    throw new HardkasCliError("L2_BUILD_MANIFEST_MISSING", `no recorded build (${manifestPath}): run hardkas l2 compile first`, { exitCode: HardkasExitCode.USAGE_ERROR });
  }
  const recorded = readL2BuildManifest(root);
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "hk-l2-check-"));
  try {
    const rebuilt = await forgeBuild(root, tools, path.join(tmp, "out"), path.join(tmp, "cache"));
    return { recorded, rebuilt, differences: compareBuilds(recorded, rebuilt) };
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
}
