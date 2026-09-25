#!/usr/bin/env node
// Runs the canonical gate (vitest.config.ts) hermetically:
//   - a private HARDKAS_HOME (a copy of --home, or empty), never the user's ~/.hardkas
//   - Docker unreachable (DOCKER_HOST points at a closed loopback port)
//   - no non-loopback network: every Node process preloads scripts/hermetic/no-network-preload.cjs
//   - no external-node or integration switches inherited from the shell
// It fails if vitest fails, and also if any process tried to reach a
// non-loopback host, even when every test passed.
//
// Usage: node scripts/gate-hermetic.mjs [--home <dir>] [--keep-home] [--deny-ports a,b] [-- <vitest args>]
//   --home <dir>       HARDKAS_HOME to copy (e.g. one where `hardkas toolchain install kaspa-wasm` ran).
//                      Without it the home is empty and every toolchain-dependent suite fails on purpose.
//   --deny-ports a,b   Also refuse loopback connections to these ports (e.g. 16210,17210,18210 to
//                      prove the gate does not depend on a kaspad that happens to run locally).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRELOAD = path.join(ROOT, "scripts", "hermetic", "no-network-preload.cjs");
const VITEST = path.join(ROOT, "node_modules", "vitest", "vitest.mjs");

const argv = process.argv.slice(2);
let sourceHome;
let keepHome = false;
let denyPorts = "";
const vitestArgs = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--home") sourceHome = path.resolve(argv[++i]);
  else if (argv[i] === "--keep-home") keepHome = true;
  else if (argv[i] === "--deny-ports") denyPorts = argv[++i] ?? "";
  else if (argv[i] === "--") vitestArgs.push(...argv.slice(i + 1)), (i = argv.length);
  else vitestArgs.push(argv[i]);
}

const home = mkdtempSync(path.join(os.tmpdir(), "hardkas-hermetic-home-"));
if (sourceHome) {
  if (!existsSync(sourceHome)) {
    console.error(`gate-hermetic: --home ${sourceHome} does not exist`);
    process.exit(2);
  }
  cpSync(sourceHome, home, { recursive: true });
}
const networkLog = path.join(home, "hermetic-network.log");

const env = { ...process.env };
for (const name of ["KASPA_SIMNET_WRPC_URL", "KASPAD_BIN", "HARDKAS_DEV_SERVER_URL", "HARDKAS_ESCROW_INTEGRATION", "HARDKAS_DEV_TOKEN", "DOCKER_CONTEXT"]) {
  delete env[name];
}
env.HARDKAS_HOME = home;
env.HARDKAS_HERMETIC_LOG = networkLog;
env.DOCKER_HOST = "tcp://127.0.0.1:1"; // nothing listens there: every docker CLI call fails fast
if (denyPorts) env.HARDKAS_HERMETIC_DENY_PORTS = denyPorts;
// Forward slashes: Node treats backslashes inside a quoted NODE_OPTIONS value as escapes.
env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --require="${PRELOAD.split(path.sep).join("/")}"`.trim();

console.log(`gate-hermetic: HARDKAS_HOME=${home}${sourceHome ? ` (copy of ${sourceHome})` : " (empty)"}`);
console.log(`gate-hermetic: DOCKER_HOST=${env.DOCKER_HOST}; preload=${PRELOAD}${denyPorts ? `; denied loopback ports=${denyPorts}` : ""}`);
console.log(`gate-hermetic: vitest run ${vitestArgs.join(" ")}`);

const started = Date.now();
const result = spawnSync(process.execPath, [VITEST, "run", ...vitestArgs], { cwd: ROOT, env, stdio: "inherit" });
const seconds = Math.round((Date.now() - started) / 1000);

const refused = [];
const deniedPorts = new Map();
const loopback = new Map();
if (existsSync(networkLog)) {
  for (const line of readFileSync(networkLog, "utf8").split(/\r?\n/)) {
    if (!line) continue;
    const [, kind, target] = line.split("\t");
    if (kind === "REFUSED_LOOPBACK_PORT") deniedPorts.set(target, (deniedPorts.get(target) ?? 0) + 1);
    else if (kind.startsWith("REFUSED")) refused.push(`${kind} ${target}`);
    else loopback.set(target, (loopback.get(target) ?? 0) + 1);
  }
}

console.log(`\ngate-hermetic: vitest exit ${result.status ?? `signal ${result.signal}`} after ${seconds}s`);
console.log(`gate-hermetic: non-loopback attempts (each one fails the gate): ${refused.length}`);
for (const line of [...new Set(refused)]) console.log(`  ${line}`);
if (denyPorts) {
  console.log(`gate-hermetic: attempts on denied loopback ports (expected when code probes a local service; the gate must pass without it):`);
  for (const [target, count] of [...deniedPorts.entries()].sort()) console.log(`  ${target} x${count}`);
}
console.log(`gate-hermetic: loopback connection targets (review for dependencies on local services):`);
for (const [target, count] of [...loopback.entries()].sort()) console.log(`  ${target} x${count}`);

if (!keepHome) rmSync(home, { recursive: true, force: true });
else console.log(`gate-hermetic: kept HARDKAS_HOME at ${home}`);

if (result.status !== 0) process.exit(result.status ?? 1);
if (refused.length > 0) {
  console.error("gate-hermetic: FAIL — the gate passed but some process tried to reach a non-loopback host");
  process.exit(1);
}
console.log("gate-hermetic: PASS");
