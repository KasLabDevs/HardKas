// JSON-PAPERCUTS probe: runs the five defect commands in a fresh simulated workspace and
// writes one log per command (exit code, stdout, stderr) so BEFORE and AFTER can be compared.
// Usage: node probe-json.mjs <before|after> [tsx|dist]
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const REPO = "C:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo";
const label = process.argv[2] || "before";
const runner = process.argv[3] || "tsx";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const outDir = path.join(here, label);
const ws = path.join(here, `ws-${label}`);
rmSync(ws, { recursive: true, force: true });
mkdirSync(ws, { recursive: true });
mkdirSync(outDir, { recursive: true });

const env = { ...process.env, HARDKAS_TEST_IGNORE_STALENESS: "1", NO_COLOR: "1", FORCE_COLOR: "0" };
function cli(args, name) {
  const cmd = runner === "dist"
    ? [process.execPath, [path.join(REPO, "packages/cli/dist/index.js"), ...args]]
    : [path.join(REPO, "node_modules/.bin/tsx.cmd"), [path.join(REPO, "packages/cli/src/index.ts"), ...args]];
  const r = spawnSync(cmd[0], cmd[1], { cwd: ws, env, encoding: "utf8", shell: runner !== "dist", maxBuffer: 64 << 20, windowsHide: true });
  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  let json = null;
  try { json = JSON.parse(stdout.trim()); } catch {}
  const jsonDocs = (stdout.match(/^\{/gm) || []).length;
  const report = [
    `$ hardkas ${args.join(" ")}`,
    `exit=${r.status} stdout_is_single_json=${json !== null} json_docs_on_stdout=${jsonDocs}`,
    `--- stdout ---`, stdout.trimEnd(), `--- stderr ---`, stderr.trimEnd(), ""
  ].join("\n");
  if (name) writeFileSync(path.join(outDir, `${name}.log`), report);
  console.log(report.split("\n").slice(0, 2).join("\n"));
  return { status: r.status, stdout, stderr, json };
}

cli(["init"], "00-init");
cli(["accounts", "fund", "alice", "--amount", "1000"], "01-fund");
const plan = cli(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "10", "--network", "simulated", "--out", "plan.json", "--json"], "02-plan");
const signed = cli(["tx", "sign", "plan.json", "--account", "alice", "--out", "signed.json", "--json"], "03-sign");
const signedJson = JSON.parse(readFileSync(path.join(ws, "signed.json"), "utf8"));
const txId = signedJson.txId;

// #40
cli(["tx", "profile", "plan.json", "--json"], "40-tx-profile-json");
cli(["tx", "profile", "plan.json"], "40-tx-profile-human");
// #5
cli(["artifact", "lineage", "signed.json", "--json"], "05-artifact-lineage-json");
cli(["artifact", "lineage", "signed.json"], "05-artifact-lineage-human");
cli(["artifact", "lineage", "missing.json", "--json"], "05-artifact-lineage-missing-json");
// #39
cli(["deploy", "track", "papercut", "--network", "simulated", "--tx-id", txId, "--status", "sent", "--json"], "39-deploy-track-json");
cli(["deploy", "track", "papercut", "--network", "simulated", "--tx-id", txId, "--status", "sent", "--json"], "39-deploy-track-duplicate-json");
cli(["deploy", "track", "papercut-human", "--network", "simulated", "--tx-id", txId], "39-deploy-track-human");
// #19: the label already exists, so the broadcast succeeds and the tracking fails
const send = cli(["tx", "send", "signed.json", "--network", "simulated", "--track", "papercut", "--json"], "19-tx-send-track-fails-json");
const receiptId = send.json?.data?.receipt?.contentHash ?? null;
// #19 control: a fresh label is recorded
cli(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "11", "--network", "simulated", "--out", "plan2.json", "--json"], "19b-plan2");
cli(["tx", "sign", "plan2.json", "--account", "alice", "--out", "signed2.json", "--json"], "19b-sign2");
const send2 = cli(["tx", "send", "signed2.json", "--network", "simulated", "--track", "papercut-ok", "--json"], "19-tx-send-track-ok-json");
cli(["deploy", "inspect", "papercut-ok", "--network", "simulated", "--json"], "19-deploy-inspect-after-send");
// replay verify --json lacks ok
if (receiptId) cli(["replay", "verify", receiptId, "--json"], "RV-replay-verify-json");
else writeFileSync(path.join(outDir, "RV-replay-verify-json.log"), "no receipt id from the send\n");
const receipt2 = send2.json?.data?.receipt?.contentHash ?? null;
if (receipt2) cli(["replay", "verify", receipt2, "--json"], "RV-replay-verify-json-2");
console.log(`\nlogs in ${outDir}`);
