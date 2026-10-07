// PAPERCUTS-2 probe (#37 #38 #44 #45 #35): runs after probe-json.mjs in the same label, reusing its
// workspace (ws-<label>) and adding bare directories. One log per check.
// Usage: node probe-papercuts.mjs <before|after> [tsx|dist]
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const REPO = "C:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo";
const label = process.argv[2] || "before";
const runner = process.argv[3] || "tsx";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const outDir = path.join(here, label);
const ws = path.join(here, `ws-${label}`);
mkdirSync(outDir, { recursive: true });

const env = { ...process.env, HARDKAS_TEST_IGNORE_STALENESS: "1", NO_COLOR: "1", FORCE_COLOR: "0" };
function cli(args, name, cwd = ws) {
  const cmd = runner === "dist"
    ? [process.execPath, [path.join(REPO, "packages/cli/dist/index.js"), ...args]]
    : [path.join(REPO, "node_modules/.bin/tsx.cmd"), [path.join(REPO, "packages/cli/src/index.ts"), ...args]];
  const r = spawnSync(cmd[0], cmd[1], { cwd, env, encoding: "utf8", shell: runner !== "dist", maxBuffer: 64 << 20, windowsHide: true });
  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  let json = null;
  try { json = JSON.parse(stdout.trim()); } catch {}
  const report = [
    `$ hardkas ${args.join(" ")}   (cwd ${path.basename(cwd)})`,
    `exit=${r.status} stdout_is_single_json=${json !== null}`,
    `--- stdout ---`, stdout.trimEnd(), `--- stderr ---`, stderr.trimEnd(), ""
  ].join("\n");
  if (name) writeFileSync(path.join(outDir, `${name}.log`), report);
  console.log(report.split("\n").slice(0, 2).join("\n"));
  return { status: r.status, stdout, stderr, json };
}
function note(name, text) {
  writeFileSync(path.join(outDir, `${name}.log`), text.endsWith("\n") ? text : text + "\n");
  console.log(`[${name}] ${text.split("\n")[0]}`);
}
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

// #35: the package.json that `hardkas init` wrote (probe-json ran init in ws)
const pkg = JSON.parse(readFileSync(path.join(ws, "package.json"), "utf8"));
note("35-init-package-json", `init package.json dependencies=${JSON.stringify(pkg.dependencies)} devDependencies=${JSON.stringify(pkg.devDependencies)}\nhas @hardkas/cli: ${Boolean(pkg.devDependencies?.["@hardkas/cli"] || pkg.dependencies?.["@hardkas/cli"])}`);

// #37: a directory without hardkas.config.ts uses the internal default config
const bare = path.join(here, `bare-${label}`);
rmSync(bare, { recursive: true, force: true });
mkdirSync(bare, { recursive: true });
cli(["config", "show"], "37-bare-config-show", bare);
const bareShow = cli(["config", "show", "--json"], "37-bare-config-show-json", bare);
note("37-bare-config-keys", `config keys (no config file): ${Object.keys(bareShow.json?.result?.config ?? {}).join(", ")}\ndefaultNetwork=${bareShow.json?.result?.config?.defaultNetwork} execution=${JSON.stringify(bareShow.json?.result?.config?.execution)}`);
const barePlan = cli(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--json"], "37-bare-tx-plan-json", bare);
note("37-bare-deprecated-warning", `DEPRECATED warning on stderr for the internal default: ${/DEPRECATED/.test(barePlan.stderr)}\n${barePlan.stderr.split(/\r?\n/).filter((l) => /DEPRECATED/.test(l)).join("\n")}`);
// the init workspace (execution contract present) must not warn either
const wsPlan = cli(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--json"], "37-init-ws-tx-plan-json", ws);
note("37-init-ws-deprecated-warning", `DEPRECATED warning on stderr in the init workspace: ${/DEPRECATED/.test(wsPlan.stderr)}`);
// a legacy config that really carries defaultNetwork must still warn (control)
const legacy = path.join(here, `legacy-${label}`);
rmSync(legacy, { recursive: true, force: true });
mkdirSync(legacy, { recursive: true });
writeFileSync(path.join(legacy, "hardkas.config.ts"), `export default { defaultNetwork: "simulated" };\n`);
const legacyPlan = cli(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--json"], "37-legacy-tx-plan-json", legacy);
note("37-legacy-deprecated-warning", `DEPRECATED warning on stderr for a user-authored defaultNetwork: ${/DEPRECATED/.test(legacyPlan.stderr)}`);

// #38: templates and generated configs
const created = path.join(here, `created-${label}`);
rmSync(created, { recursive: true, force: true });
cli(["create", "payment-app", created], "38-create-payment-app");
const createdCfg = existsSync(path.join(created, "hardkas.config.ts")) ? readFileSync(path.join(created, "hardkas.config.ts"), "utf8") : "(no hardkas.config.ts)";
note("38-created-config", `create payment-app → hardkas.config.ts uses defaultNetwork: ${/defaultNetwork/.test(createdCfg)} · uses execution: ${/execution:/.test(createdCfg)}\n---\n${createdCfg}`);
const cfgInit = path.join(here, `cfginit-${label}`);
rmSync(cfgInit, { recursive: true, force: true });
mkdirSync(cfgInit, { recursive: true });
cli(["config", "init"], "38-config-init", cfgInit);
const cfgInitText = readFileSync(path.join(cfgInit, "hardkas.config.ts"), "utf8");
note("38-config-init-config", `config init → uses defaultNetwork: ${/defaultNetwork/.test(cfgInitText)} · uses execution: ${/execution:/.test(cfgInitText)}\n---\n${cfgInitText}`);
for (const t of ["payment-app", "batch-payments", "local-indexer"]) {
  const text = readFileSync(path.join(REPO, "packages/cli/templates", t, "hardkas.config.ts"), "utf8");
  note(`38-template-${t}`, `template ${t}/hardkas.config.ts uses defaultNetwork: ${/defaultNetwork/.test(text)} · uses execution: ${/execution:/.test(text)}`);
}

// #44: a simulator receipt without tracePath never gets MISSING_TRACE (the check compares mode with "simulated")
const receipts = walk(path.join(ws, ".hardkas", "artifacts")).filter((f) => /receipt/i.test(path.basename(f)) && f.endsWith(".json"));
const receiptFile = receipts.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
if (receiptFile) {
  const receipt = JSON.parse(readFileSync(receiptFile, "utf8"));
  note("44-receipt-shape", `receipt ${path.basename(receiptFile)} mode=${receipt.mode} networkId=${receipt.networkId} tracePath=${receipt.tracePath ?? "(none)"}`);
  const stripped = { ...receipt };
  delete stripped.tracePath;
  const strippedPath = path.join(ws, "receipt-without-trace.json");
  writeFileSync(strippedPath, JSON.stringify(stripped, null, 2));
  cli(["artifact", "verify", path.relative(ws, receiptFile), "--strict", "--json"], "44-artifact-verify-receipt-strict");
  const r = cli(["artifact", "verify", "receipt-without-trace.json", "--strict", "--json"], "44-artifact-verify-receipt-no-trace-strict");
  note("44-missing-trace", `MISSING_TRACE reported for a simulator receipt without tracePath: ${/MISSING_TRACE/.test(r.stdout + r.stderr)}`);
  cli(["tx", "verify", "receipt-without-trace.json", "--json"], "44-tx-verify-receipt-no-trace");
} else note("44-receipt-shape", "no receipt found in the workspace");
// #44 companion: a simulator plan is never checked for environment consistency either
const planFile = path.join(ws, "plan.json");
if (existsSync(planFile)) {
  const plan = JSON.parse(readFileSync(planFile, "utf8"));
  note("44-plan-shape", `plan.json mode=${plan.mode} networkId=${plan.networkId}`);
  const mixed = { ...plan, networkId: "mainnet" };
  writeFileSync(path.join(ws, "plan-simulator-on-mainnet.json"), JSON.stringify(mixed, null, 2));
  const r = cli(["tx", "verify", "plan-simulator-on-mainnet.json", "--json"], "44-tx-verify-simulator-plan-on-mainnet");
  note("44-env-consistency", `ENV_CONSISTENCY_FAILURE reported for a simulator plan that claims mainnet: ${/ENV_CONSISTENCY_FAILURE/.test(r.stdout + r.stderr)}`);
}

// #45: the snapshot manifest's hardkasVersion
const snap = cli(["localnet", "snapshot", "create", `snap-${label}`, "--json"], "45-snapshot-create");
const manifests = walk(path.join(ws, ".hardkas")).filter((f) => path.basename(f) === "manifest.json" && f.includes(`snap-${label}`));
if (manifests[0]) {
  const m = JSON.parse(readFileSync(manifests[0], "utf8"));
  const corePkg = JSON.parse(readFileSync(path.join(REPO, "packages/core/package.json"), "utf8"));
  note("45-snapshot-manifest-version", `manifest ${path.relative(ws, manifests[0])} hardkasVersion=${m.hardkasVersion} · @hardkas/core package.json version=${corePkg.version}\nsource of the value in packages/core/src/snapshot.ts: ${/hardkasVersion:\s*"\d/.test(readFileSync(path.join(REPO, "packages/core/src/snapshot.ts"), "utf8")) ? "hardcoded literal" : "constant"}`);
} else note("45-snapshot-manifest-version", `no manifest found (snapshot create exit ${snap.status})`);
console.log(`\nlogs in ${outDir}`);
