// Mechanical fixes probe (#3 accounts balance network, #8 dev accounts export, #9 dev tx generate,
// #10 env check, #41 node status rpc.url): real processes. BEFORE runs the main checkout's build
// of HEAD b926fd75e, AFTER the isolated worktree's build.
// Usage: node probe-mech.mjs <before|after>
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

const label = process.argv[2] || "before";
const CLI = label === "before"
  ? "C:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/packages/cli/dist/index.js"
  : "C:/Users/jrodr/AppData/Local/Temp/hk-crc1/wt/packages/cli/dist/index.js";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const outDir = path.join(here, `mech-${label}`);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const env = { ...process.env, HARDKAS_TEST_IGNORE_STALENESS: "1", NO_COLOR: "1", FORCE_COLOR: "0" };
delete env.HARDKAS_ALLOW_SIMULATED_NODE;

function cli(name, args, cwd, extraEnv = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env: { ...env, ...extraEnv }, encoding: "utf8", maxBuffer: 64 << 20, windowsHide: true, timeout: 180_000 });
  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  let json = null;
  try { json = JSON.parse(stdout.trim()); } catch {}
  writeFileSync(path.join(outDir, `${name}.log`), [`$ hardkas ${args.join(" ")}   (cwd ${path.basename(cwd)}${Object.keys(extraEnv).length ? ", env " + JSON.stringify(extraEnv) : ""})`, `exit=${r.status} stdout_is_single_json=${json !== null}`, "--- stdout ---", stdout.trimEnd(), "--- stderr ---", stderr.trimEnd(), ""].join("\n"));
  console.log(`${name}: exit=${r.status} ${json ? `json ok=${json.ok}${json.code ? " code=" + json.code : ""}` : "no json"}`);
  return { status: r.status, stdout, stderr, json };
}

const ws = path.join(here, `mech-ws-${label}`);
rmSync(ws, { recursive: true, force: true });
mkdirSync(ws, { recursive: true });
cli("00-init", ["init", "--skip-toolchain", "--json"], ws);
// #3
cli("03-accounts-balance-no-network-json", ["accounts", "balance", "alice", "--json"], ws);
// #9
cli("09-dev-tx-generate-json", ["dev", "tx", "generate", "--count", "2", "--json"], ws);
// #8
cli("08-dev-accounts-export-alice", ["dev", "accounts", "export", "kasware", "--alias", "alice"], ws);
cli("08-dev-accounts-export-nobody", ["dev", "accounts", "export", "kasware", "--alias", "nobody"], ws);
// #10
const bare = path.join(here, `mech-bare-${label}`);
rmSync(bare, { recursive: true, force: true });
mkdirSync(bare, { recursive: true });
cli("10-env-check-bare", ["env", "check"], bare);
cli("10-env-check-typo", ["env", "check"], bare, { HARDKAS_HOEM: "oops" });
// #41 (read-only docker inspect)
cli("41-node-status-json", ["node", "status", "--json"], ws);
console.log(`logs in ${outDir}`);
