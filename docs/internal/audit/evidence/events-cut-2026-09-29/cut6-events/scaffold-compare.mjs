// Surface Cut 3a: a freshly created HardKAS project, before vs after, exactly as a user
// gets it. Each variant takes its own packed set (packed-smoke.mjs label dir): the CLI
// installed from that set scaffolds the project (`hardkas init`), with an empty
// HARDKAS_HOME; then npm install, npm test (the generated payment scenario), the SDK
// import, whether `@hardkas/rpc-events` got installed, whether a Hardkas instance has
// `events`, and the same CLI commands inside the project. The only harness addition is
// npm "overrides" pointing @hardkas/* at the local tarballs (this version is not on npm).
// Generalised from cut5-deadcode/deps-2b/scaffold-regression.mjs. Repository untouched.
// usage: node scaffold-compare.mjs <beforeLabelDir> <afterLabelDir> <outDir>
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [beforeDir, afterDir, outDir] = process.argv.slice(2).map((a) => path.resolve(a));
function packedSet(labelDir) {
  const packed = JSON.parse(fs.readFileSync(path.join(labelDir, "result.json"), "utf8"));
  const overrides = Object.fromEntries(packed.packs.map((p) => [p.name, "file:" + p.tarball.split(path.sep).join("/")]));
  const cliDir = path.join(labelDir, "npm-consumer", "node_modules", "@hardkas", "cli");
  const cliPkg = JSON.parse(fs.readFileSync(path.join(cliDir, "package.json"), "utf8"));
  const bin = fs.realpathSync(path.join(cliDir, typeof cliPkg.bin === "string" ? cliPkg.bin : cliPkg.bin.hardkas));
  return { labelDir, overrides, bin, packs: packed.packs.length };
}
const sets = { before: packedSet(beforeDir), after: packedSet(afterDir) };

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const result = { sets, variants: {} };
const save = () => fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));
const tail = (s, n = 8) => (s ?? "").trim().split(/\r?\n/).slice(-n).join("\n");
function sh(cmd, args, cwd, env, shell = process.platform === "win32") {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd, env, encoding: "utf8", shell, maxBuffer: 256 * 1024 * 1024, timeout: 20 * 60 * 1000 });
  return { status: r.status, ms: Date.now() - t0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

for (const variant of ["before", "after"]) {
  const { overrides, bin } = sets[variant];
  const base = path.join(outDir, variant);
  const home = path.join(outDir, `${variant}-hardkas-home`);
  fs.mkdirSync(base);
  fs.mkdirSync(home);
  const env = { ...process.env, HARDKAS_HOME: home };
  const v = { steps: [] };
  result.variants[variant] = v;
  const step = (name, r, extra = {}) => {
    v.steps.push({ name, status: r.status, ms: r.ms, out: tail(r.stdout, 6), err: tail(r.stderr, 6), ...extra });
    save();
    return r;
  };

  step("hardkas init proj", sh("node", [bin, "init", "proj", "--json"], base, env, false));
  const proj = path.join(base, "proj");
  const pjFile = path.join(proj, "package.json");
  const pj = JSON.parse(fs.readFileSync(pjFile, "utf8"));
  v.scaffoldDependencies = { ...pj.dependencies };
  v.scaffoldDevDependencies = { ...pj.devDependencies };
  // npm refuses an override that differs from a direct dependency (EOVERRIDE), so the
  // scaffold's direct @hardkas/* pins point at the same tarballs.
  for (const sec of ["dependencies", "devDependencies"]) {
    for (const name of Object.keys(pj[sec] ?? {})) if (overrides[name]) pj[sec][name] = overrides[name];
  }
  pj.overrides = overrides;
  fs.writeFileSync(pjFile, JSON.stringify(pj, null, 2) + "\n");

  const inst = step("npm install", sh("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], proj, env));
  if (inst.status !== 0) continue;
  v.rpcEventsInstalled = fs.existsSync(path.join(proj, "node_modules", "@hardkas", "rpc-events"));
  const lock = JSON.parse(fs.readFileSync(path.join(proj, "package-lock.json"), "utf8"));
  v.hardkasFromRegistry = Object.entries(lock.packages ?? {})
    .filter(([k, x]) => k.split("node_modules/").pop().startsWith("@hardkas/") && x.resolved && !String(x.resolved).startsWith("file:"))
    .map(([k]) => k);
  v.installedPackages = Object.keys(lock.packages ?? {}).filter((k) => k.startsWith("node_modules/")).length;

  const test = step("npm test", sh("npm", ["test"], proj, env));
  v.testPassed = test.status === 0 && /1 passed/.test(test.stdout + test.stderr);
  v.testSummary = ((test.stdout + test.stderr).match(/Tests?\s+\d+ (passed|failed)[^\n]*/g) ?? []).join(" | ");

  step("import @hardkas/sdk", sh("node", ["-e", "import('@hardkas/sdk').then(m=>console.log(Object.keys(m).length+' exports'))"], proj, env, false));
  const probe = step(
    "Hardkas instance has events?",
    sh("node", ["-e", "import('@hardkas/sdk').then(async m=>{const hk=await m.Hardkas.open('.');console.log(JSON.stringify({events:'events' in hk}))})"], proj, env, false)
  );
  try { v.instanceHasEvents = JSON.parse(probe.stdout.trim().split(/\r?\n/).pop()).events; } catch { v.instanceHasEvents = null; }
  const acc = step("hardkas accounts list --json", sh("node", [bin, "accounts", "list", "--json"], proj, env, false));
  let names = [];
  try { names = JSON.parse(acc.stdout).map((a) => a.name); } catch {}
  step("hardkas tx plan", sh("node", [bin, "tx", "plan", "--from", names[0] ?? "alice", "--to", names[1] ?? "bob", "--amount", "1", "--out", "plan.json", "--json"], proj, env, false));
  step("hardkas artifact verify plan.json", sh("node", [bin, "artifact", "verify", "plan.json", "--json"], proj, env, false));
  step("hardkas query artifacts list", sh("node", [bin, "query", "artifacts", "list", "--json"], proj, env, false));
}

const b = result.variants.before;
const a = result.variants.after;
const sig = (x) => x.steps.filter((s) => s.name !== "Hardkas instance has events?").map((s) => `${s.name}=${s.status}`).join(" | ");
result.summary = {
  packs: { before: sets.before.packs, after: sets.after.packs },
  scaffoldDependencies: { before: b.scaffoldDependencies, after: a.scaffoldDependencies },
  rpcEventsInstalled: { before: b.rpcEventsInstalled, after: a.rpcEventsInstalled },
  instanceHasEvents: { before: b.instanceHasEvents, after: a.instanceHasEvents },
  hardkasFromRegistry: { before: b.hardkasFromRegistry?.length, after: a.hardkasFromRegistry?.length },
  installedPackages: { before: b.installedPackages, after: a.installedPackages },
  npmTest: { before: b.testSummary, after: a.testSummary, bothPassed: b.testPassed && a.testPassed },
  steps: { before: sig(b), after: sig(a), identical: sig(b) === sig(a) }
};
save();
console.log(JSON.stringify(result.summary, null, 2));
