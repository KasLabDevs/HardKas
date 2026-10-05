// CLI-RUNTIME-CONTRACT-1 probe: the discriminating scenarios of the BEFORE/AFTER matrix, run as real
// processes on the built CLI of the isolated worktree. One log per scenario + a matrix.tsv.
// Usage: node probe-crc.mjs <before|after>
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const WT = "C:/Users/jrodr/AppData/Local/Temp/hk-crc1/wt";
const CLI = path.join(WT, "packages/cli/dist/index.js");
const label = process.argv[2] || "before";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const outDir = path.join(here, label);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const baseEnv = { ...process.env, HARDKAS_TEST_IGNORE_STALENESS: "1", NO_COLOR: "1", FORCE_COLOR: "0" };
delete baseEnv.HARDKAS_ALLOW_SIMULATED_NODE;
// Docker "unavailable": the CLI is installed but the daemon endpoint refuses connections.
const dockerDown = { ...baseEnv, DOCKER_HOST: "tcp://127.0.0.1:1" };

const rows = [];
function cli(name, args, { cwd, env = baseEnv, expect = "" } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: "utf8", maxBuffer: 64 << 20, windowsHide: true, timeout: 180_000 });
  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  let json = null;
  try { json = JSON.parse(stdout.trim()); } catch {}
  const report = [
    `$ hardkas ${args.join(" ")}   (cwd ${path.basename(cwd)}${env === dockerDown ? ", DOCKER_HOST=tcp://127.0.0.1:1" : ""})`,
    `exit=${r.status} stdout_is_single_json=${json !== null}`,
    `--- stdout ---`, stdout.trimEnd(), `--- stderr ---`, stderr.trimEnd(), ""
  ].join("\n");
  writeFileSync(path.join(outDir, `${name}.log`), report);
  const code = json && json.ok === false ? json.code ?? "" : "";
  const summary = [name, args.join(" "), r.status, json ? `json ok=${json.ok}${code ? " code=" + code : ""}` : "no json", expect];
  rows.push(summary);
  console.log(`${name}: exit=${r.status} ${json ? `json ok=${json.ok}${code ? " code=" + code : ""}` : "no json"}`);
  return { status: r.status, stdout, stderr, json, all: stdout + "\n" + stderr };
}

// workspaces
const ws = path.join(here, `ws-${label}`);
rmSync(ws, { recursive: true, force: true });
mkdirSync(ws, { recursive: true });
cli("00-init", ["init", "--skip-toolchain", "--json"], { cwd: ws, expect: "exit 0 (control)" });

// S1 node start, Docker unavailable
cli("S1-node-start-json", ["node", "start", "--json"], { cwd: ws, env: dockerDown, expect: "exit!=0, code DOCKER_UNAVAILABLE, no success" });
cli("S1-node-start-human", ["node", "start"], { cwd: ws, env: dockerDown, expect: "exit!=0, [DOCKER_UNAVAILABLE], no 'started'" });
// S2 node stop, Docker unavailable
const s2h = cli("S2-node-stop-human", ["node", "stop"], { cwd: ws, env: dockerDown, expect: "exit!=0, no 'Node stopped'" });
cli("S2-node-stop-json", ["node", "stop", "--json"], { cwd: ws, env: dockerDown, expect: "exit!=0, one envelope ok:false code DOCKER_UNAVAILABLE" });
// S3 node status, Docker unavailable
cli("S3-node-status-json", ["node", "status", "--json"], { cwd: ws, env: dockerDown, expect: "exit!=0, no docker.available:true" });
cli("S3-node-status-human", ["node", "status"], { cwd: ws, env: dockerDown, expect: "exit!=0, [DOCKER_UNAVAILABLE]" });
// S4 node logs, Docker unavailable
cli("S4-node-logs-json", ["node", "logs", "--json"], { cwd: ws, env: dockerDown, expect: "exit!=0, typed code (not UNKNOWN_ERROR)" });
// S5 node reset with planted chain data, Docker unavailable
const marker = path.join(ws, ".hardkas", "kaspad", "marker.txt");
mkdirSync(path.dirname(marker), { recursive: true });
writeFileSync(marker, "chain data that must survive an impossible reset\n");
const s5 = cli("S5-node-reset-json", ["node", "reset", "--yes", "--json"], { cwd: ws, env: dockerDown, expect: "exit!=0, chain data kept" });
writeFileSync(path.join(outDir, "S5-node-reset-data-kept.log"), `chain data marker still exists after 'node reset' with Docker unavailable: ${existsSync(marker)}\n`);
console.log(`S5 data kept: ${existsSync(marker)}`);
// S6 node restart, Docker unavailable
cli("S6-node-restart-json", ["node", "restart", "--json"], { cwd: ws, env: dockerDown, expect: "exit!=0, code DOCKER_UNAVAILABLE" });

// S7 a wrapper that destroys the original error: dev init outside a Node project
const empty = path.join(here, `empty-${label}`);
rmSync(empty, { recursive: true, force: true });
mkdirSync(empty, { recursive: true });
cli("S7-dev-init-human", ["dev", "init"], { cwd: empty, expect: "exit!=0, NOT_NODE_PROJECT + 'No package.json found' (not 'Dev init failed')" });
// S8 replay diff wrapper
cli("S8-replay-diff-json", ["replay", "diff", "a".repeat(64), "b".repeat(64), "--json"], { cwd: ws, expect: "exit!=0, the original message (not 'Command failed')" });
// S9 usage error of explain/why (two targets)
cli("S9-why-usage-json", ["why", "--plan", "a".repeat(64), "--signed", "b".repeat(64), "--json"], { cwd: ws, expect: "exit 2, code LOOKUP_USAGE" });
cli("S9-explain-usage-human", ["explain", "--plan", "a".repeat(64), "--signed", "b".repeat(64)], { cwd: ws, expect: "exit 2, LOOKUP_USAGE in output (explain has no --json)" });
// S10/S11 rpc verdicts
cli("S10-rpc-info-json", ["rpc", "info", "--url", "ws://127.0.0.1:1", "--json"], { cwd: ws, expect: "exit!=0, json ok:false with code" });
cli("S11-rpc-health-json", ["rpc", "health", "--json"], { cwd: ws, expect: "exit!=0, json ok:false code RPC_NOT_READY" });
// S12 controls: real successes
cli("S12-lock-list-json", ["lock", "list", "--json"], { cwd: ws, expect: "exit 0, ok:true" });
cli("S12-tx-plan-json", ["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--json"], { cwd: ws, expect: "exit 0" });
cli("S12-node-status-real-docker", ["node", "status", "--json"], { cwd: ws, expect: "exit 0 (Docker reachable, read-only inspect)" });
cli("S12-doctor-json", ["doctor", "--json"], { cwd: ws, expect: "exit 0 or its own verdict; one JSON" });

const header = ["scenario", "command", "exit", "json", "expected (contract)"];
writeFileSync(path.join(outDir, "matrix.tsv"), [header, ...rows].map((r) => r.join("\t")).join("\n") + "\n");
console.log(`\nlogs + matrix.tsv in ${outDir}`);
