// MINI-REAUDIT-1 · battery TEST: `hardkas test` verdicts (no tests, a failing test, the init scaffold) and the evidence
// it packs (pack → verify → tamper → verify). Hermetic (harness.mjs).
// usage: node --require <wt>/scripts/hermetic/no-network-preload.cjs adv-test.mjs <wt> <runDir> [probeId ...]
import fs from "node:fs";
import path from "node:path";
import { setup } from "./harness.mjs";

const [wt, runDir, ...only] = process.argv.slice(2);
const H = setup(wt, runDir, only);
const { cli, docs, both, codeOf, crashed, newWorkspace, short, probe, listFiles, rel } = H;

const testRun = (dir, extra = []) => {
  const r = cli(["test", ...extra, "--json"], dir, { timeout: 240_000 });
  const d = docs(r.stdout).find((x) => x && typeof x === "object" && ("passed" in x || "ok" in x)) ?? null;
  return { r, d };
};

let INIT;
const initProject = () => {
  if (INIT) return INIT;
  const base = path.join(runDir, "test-init");
  fs.mkdirSync(base, { recursive: true });
  const r = cli(["init", "proj"], base, { timeout: 180_000 });
  INIT = { dir: path.join(base, "proj"), init: r };
  return INIT;
};

probe("TEST-INIT-SCAFFOLD", "test runner", "`hardkas test` in a freshly initialised project runs its scaffolded test and reports it truthfully", async () => {
  const { dir, init } = initProject();
  const { r, d } = testRun(dir);
  return {
    verdict: init.status !== 0 ? "INCONCLUSIVE" : r.status === 0 && d?.ok !== false ? "OK" : "DEFECT",
    sev: r.status === 0 ? undefined : "medium",
    why: `init ${init.status}; test exit ${r.status} ${codeOf(r) ?? ""}; doc ${JSON.stringify(d)?.slice(0, 300)}`,
    evidence: { test: short(r, 1500) }
  };
});

probe("TEST-NO-TESTS", "test runner", "`hardkas test` where no test file exists does not report a pass", async () => {
  const w = await newWorkspace("ws-notests");
  fs.writeFileSync(path.join(w, "hardkas.config.ts"), "export default {};\n");
  const { r, d } = testRun(w);
  const claimsPass = r.status === 0 && (d?.ok === true || d?.passed === true);
  return {
    verdict: claimsPass ? "DEFECT" : "OK",
    sev: claimsPass ? "medium" : undefined,
    why: `exit ${r.status} ${codeOf(r) ?? ""}; doc ${JSON.stringify(d)?.slice(0, 300)}`,
    evidence: { test: short(r, 1200) }
  };
});

probe("TEST-FAILING", "test runner", "a failing test makes `hardkas test` fail (non-zero, ok:false)", async () => {
  const w = await newWorkspace("ws-failing");
  fs.writeFileSync(path.join(w, "hardkas.config.ts"), "export default {};\n");
  fs.mkdirSync(path.join(w, "test"), { recursive: true });
  fs.writeFileSync(path.join(w, "test", "fail.test.ts"), 'import { test, expect } from "vitest";\ntest("fails", () => { expect(1).toBe(2); });\n');
  const { r, d } = testRun(w);
  const claimsPass = r.status === 0 || d?.ok === true || d?.passed === true;
  return {
    verdict: claimsPass ? "DEFECT" : "OK",
    sev: claimsPass ? "high" : undefined,
    why: `exit ${r.status} ${codeOf(r) ?? ""}; doc ${JSON.stringify(d)?.slice(0, 300)}`,
    evidence: { test: short(r, 1500) }
  };
});

probe("TEST-EVIDENCE", "evidence", "`hardkas test --evidence` packs what the scenarios produced; the package verifies; a tampered package does not", async () => {
  const { dir } = initProject();
  const { r, d } = testRun(dir, ["--evidence"]);
  const pkgs = listFiles(dir).filter((p) => /evidence/i.test(p) && /\.(json|tgz|zip|hkev|tar)$/i.test(p) && !/node_modules/.test(p));
  if (!pkgs.length) return { verdict: "NOTE", why: `test --evidence exit ${r.status}; no evidence package found (scenarios executed: ${d?.result?.scenariosExecuted ?? d?.scenariosExecuted ?? "?"})`, evidence: { test: short(r, 1200) } };
  const pkg = pkgs[0];
  const v1 = cli(["evidence", "verify", rel(dir, pkg), "--json"], dir);
  const t = fs.readFileSync(pkg, "utf8").replace(/"(passed|success|ok)"\s*:\s*false/, '"$1": true').replace(/("amountSompi"\s*:\s*")(\d)/, (m, a, x) => `${a}${(Number(x) + 1) % 10}`);
  const tampered = path.join(dir, "tampered-evidence.json");
  fs.writeFileSync(tampered, t);
  const v2 = cli(["evidence", "verify", "tampered-evidence.json", "--json"], dir);
  return {
    verdict: v1.status === 0 && v2.status !== 0 ? "OK" : "DEFECT",
    sev: v2.status === 0 && t !== fs.readFileSync(pkg, "utf8") ? "high" : v1.status !== 0 ? "medium" : undefined,
    why: `packages ${pkgs.map((p) => rel(dir, p)).join(", ")}; verify ${v1.status} ${codeOf(v1) ?? ""}; tampered verify ${v2.status} ${codeOf(v2) ?? ""}; tamper changed bytes: ${t !== fs.readFileSync(pkg, "utf8")}`,
    evidence: { test: short(r, 800), v1: short(v1, 600), v2: short(v2, 600) }
  };
});

await H.run();
