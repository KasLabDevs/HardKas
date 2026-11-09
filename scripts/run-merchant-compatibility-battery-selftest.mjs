// scripts/run-merchant-compatibility-battery-selftest.mjs
// Self-test of the merchant compatibility evidence rules (HK-07, CA-EV-06, SIM-12).
//   1. The versioned evidence of the retired batteries (logs/merchant-compat-*.jsonl from v1,
//      logs/merchant-compatibility-results.json from the old v2) does NOT verify, and the reasons are listed.
//   2. A real run of the battery (simulator environment, no Docker) verifies.
//   3. Every forgery of that real run is rejected: fabricated PASS, literal verdict text, edited output, foreign
//      output, zero duration, legacy statuses, missing or false checks, duplicated transaction, evidence on NOT_EXECUTED.
// Usage: node scripts/run-merchant-compatibility-battery-selftest.mjs [--keep]
// Exit 0 only if every expectation holds. Writes only under the OS temp directory.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ENVIRONMENTS, OPERATIONS, verifyMerchantCompatResults } from "./run-merchant-compatibility-battery-evidence.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const keep = process.argv.includes("--keep");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-merchant-selftest-"));
let failures = 0;
const expect = (label, cond, extra = "") => {
  console.log(`${cond ? "ok  " : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
};

// 1. Versioned legacy evidence
{
  const legacyV2 = JSON.parse(fs.readFileSync(path.join(ROOT, "logs", "merchant-compatibility-results.json"), "utf8"));
  const r = verifyMerchantCompatResults(legacyV2, { outDir: path.join(ROOT, "logs") });
  const pass = Object.values(legacyV2.operations).flatMap((o) => ENVIRONMENTS.map((e) => o.environments?.[e]?.status)).filter((s) => s === "PASS" || s === "OFFLINE_PASS").length;
  expect("legacy logs/merchant-compatibility-results.json does not verify", !r.ok, `${r.problems.length} problems; ${pass} PASS/OFFLINE_PASS rows, none with a stored output`);
  for (const p of r.problems.slice(0, 5)) console.log(`       e.g. ${p}`);

  const operations = {};
  for (const op of OPERATIONS) operations[op.id] = { id: op.id, name: op.name, environments: {} };
  let rows = 0;
  let zeroMs = 0;
  for (const env of ENVIRONMENTS) {
    const file = path.join(ROOT, "logs", `merchant-compat-${env}.jsonl`);
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean)) {
      const j = JSON.parse(line);
      rows++;
      if (j.durationMs === 0) zeroMs++;
      operations[j.opId].environments[env] = { id: j.opId, env, status: j.status, durationMs: j.durationMs, detail: j.detail };
    }
  }
  const v1 = verifyMerchantCompatResults({ schema: "v1-jsonl", metadata: {}, operations }, { outDir: path.join(ROOT, "logs") });
  expect("legacy logs/merchant-compat-*.jsonl (v1) do not verify", !v1.ok, `${rows} rows, ${zeroMs} with durationMs 0, ${v1.problems.length} problems`);
}

// 2. A real run (simulator only: no Docker needed)
const runDir = path.join(work, "run");
const run = spawnSync(process.execPath, [path.join(ROOT, "scripts", "run-merchant-compatibility-battery-v2.mjs"), "--envs", "simulator", "--out", runDir], {
  cwd: ROOT,
  encoding: "utf8",
  env: process.env
});
process.stdout.write(run.stdout.split(/\r?\n/).map((l) => `       | ${l}`).join("\n") + "\n");
if (run.status !== 0) process.stdout.write(run.stderr);
expect("battery v2 (simulator) exits 0", run.status === 0, `exit ${run.status}`);
const model = JSON.parse(fs.readFileSync(path.join(runDir, "results.json"), "utf8"));
const real = verifyMerchantCompatResults(model, { outDir: runDir });
expect("the real run verifies", real.ok, real.problems.slice(0, 3).join(" | "));
expect("the real run has executed PASS rows", real.counts.simulator.PASS > 0, `simulator PASS=${real.counts.simulator.PASS} FAIL=${real.counts.simulator.FAIL} NOT_EXECUTED=${real.counts.simulator.NOT_EXECUTED}`);
expect("nothing unselected is PASS", real.counts.simnet.PASS === 0 && real.counts.testnet.PASS === 0);
for (const op of Object.values(model.operations)) {
  const r = op.environments.simulator;
  if (r.status === "PASS" && !(r.durationMs > 0)) expect(`${op.id} PASS has a measured duration`, false);
}

// 3. Forgeries of the real run
const clone = (v) => JSON.parse(JSON.stringify(v));
const passIds = Object.values(model.operations).filter((o) => o.environments.simulator.status === "PASS").map((o) => o.id);
const notExecIds = Object.values(model.operations).filter((o) => o.environments.simulator.status === "NOT_EXECUTED").map((o) => o.id);
const A = passIds[0];
const B = passIds.find((id) => model.operations[id].environments.simulator.outputRef && id !== A);
const N = notExecIds[0];
const txRows = passIds.filter((id) => {
  const out = JSON.parse(fs.readFileSync(path.join(runDir, model.operations[id].environments.simulator.outputRef), "utf8"));
  return typeof out.observed?.transactionId === "string";
});

function forged(label, mutate, expectedPattern, { mutateDir } = {}) {
  const m = clone(model);
  let dir = runDir;
  if (mutateDir) {
    dir = path.join(work, `forged-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`);
    fs.cpSync(runDir, dir, { recursive: true });
    mutateDir(dir, m);
  }
  mutate(m);
  const r = verifyMerchantCompatResults(m, { outDir: dir });
  const hit = r.problems.some((p) => expectedPattern.test(p));
  expect(`rejects: ${label}`, !r.ok && hit, hit ? "" : `problems: ${r.problems.slice(0, 3).join(" | ") || "none"}`);
}

forged("a NOT_EXECUTED row turned into PASS with another row's evidence", (m) => {
  m.operations[N].environments.simulator = { ...clone(m.operations[A].environments.simulator), id: N };
}, /is not declared for/);
forged("a literal verdict text", (m) => {
  m.operations[A].environments.simulator.detail = "Executed successfully against simulator artifacts/RPC";
}, /detail is not the text derived/);
forged("a wrong output digest", (m) => {
  m.operations[A].environments.simulator.outputSha256 = "0".repeat(64);
}, /digest does not match/);
forged("an edited observed response", () => {}, /digest does not match|does not hold/, {
  mutateDir: (dir, m) => {
    const f = path.join(dir, m.operations[A].environments.simulator.outputRef);
    const out = JSON.parse(fs.readFileSync(f, "utf8"));
    out.observed = { forged: true };
    fs.writeFileSync(f, JSON.stringify(out, null, 2) + "\n");
  }
});
forged("an output file of another operation", (m) => {
  m.operations[A].environments.simulator.outputRef = m.operations[B].environments.simulator.outputRef;
  m.operations[A].environments.simulator.outputSha256 = m.operations[B].environments.simulator.outputSha256;
}, /another executor\/command\/env|detail is not|does not hold/);
forged("an output of another run", () => {}, /belongs to run/, {
  mutateDir: (dir, m) => {
    const ref = m.operations[A].environments.simulator.outputRef;
    const f = path.join(dir, ref);
    const out = JSON.parse(fs.readFileSync(f, "utf8"));
    out.runId = "f".repeat(32);
    fs.writeFileSync(f, JSON.stringify(out, null, 2) + "\n");
    // keep the digest consistent so only the run id is wrong
    m.operations[A].environments.simulator.outputSha256 = sha(f);
  }
});
forged("a zero duration", (m) => {
  m.operations[A].environments.simulator.durationMs = 0;
}, /not a measured duration/);
forged("a legacy OFFLINE_PASS status", (m) => {
  m.operations[N].environments.testnet = { id: N, env: "testnet", status: "OFFLINE_PASS", detail: "offline specification verified" };
}, /is not one of PASS\/FAIL\/NOT_EXECUTED/);
forged("a legacy NOT_IMPLEMENTED status", (m) => {
  m.operations[N].environments.simulator = { id: N, env: "simulator", status: "NOT_IMPLEMENTED", detail: "x" };
}, /is not one of PASS\/FAIL\/NOT_EXECUTED/);
forged("a PASS without checks", (m) => {
  m.operations[A].environments.simulator.checks = [];
}, /PASS without checks/);
forged("a check that does not hold on the output", (m) => {
  const c = m.operations[A].environments.simulator.checks[0];
  c.op = "eq";
  c.value = "a value the node never returned";
}, /does not hold on the output file/);
forged("a NOT_EXECUTED row carrying evidence", (m) => {
  Object.assign(m.operations[N].environments.simulator, { outputRef: m.operations[A].environments.simulator.outputRef });
}, /NOT_EXECUTED carries execution evidence/);
if (txRows.length >= 2) {
  forged("two rows claiming one transaction", () => {}, /is also claimed by/, {
    mutateDir: (dir, m) => {
      const [x, y] = txRows;
      const fx = path.join(dir, m.operations[x].environments.simulator.outputRef);
      const fy = path.join(dir, m.operations[y].environments.simulator.outputRef);
      const ox = JSON.parse(fs.readFileSync(fx, "utf8"));
      const oy = JSON.parse(fs.readFileSync(fy, "utf8"));
      oy.observed.transactionId = ox.observed.transactionId;
      fs.writeFileSync(fy, JSON.stringify(oy, null, 2) + "\n");
      m.operations[y].environments.simulator.outputSha256 = sha(fy);
      m.operations[y].environments.simulator.detail = undefined; // the regenerated text would differ too; the duplicate is what is checked
    }
  });
}

function sha(f) {
  return crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
}

if (!keep) fs.rmSync(work, { recursive: true, force: true });
else console.log(`kept ${work}`);
console.log(failures === 0 ? "\nselftest: PASS (every expectation held)" : `\nselftest: FAIL (${failures} expectation(s) did not hold)`);
process.exit(failures === 0 ? 0 : 1);
