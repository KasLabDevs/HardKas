// MINI-REAUDIT-1 · battery SWEEP: the CLI runtime contract over every registered leaf command (from the help tree of
// help-tree-1), with bogus inputs, in two places: an empty directory (no workspace) and a used workspace. Hermetic
// (harness.mjs). Classes recorded per run:
//   EXIT0_ON_ERROR (an error is shown or ok:false is printed, and the exit code is 0) · UNTYPED (JSON failure envelope
//   with UNKNOWN_ERROR or no code) · JSON_MISSING (--json asked, no JSON document on stdout) · JSON_MULTI (more than one
//   document) · CRASH (a stack trace or a raw JS error class in the output) · HANG (killed at the timeout) · STRAY_WRITE
//   (a file appeared outside the command's own directory and the private home) · NATIVE_CRASH (an exit code outside
//   0..255, e.g. 0xC0000409, or a native "Assertion failed" on stderr).
// usage: node --require <wt>/scripts/hermetic/no-network-preload.cjs adv-sweep.mjs <wt> <runDir> <help-tree-run-dir>
import fs from "node:fs";
import path from "node:path";
import { setup } from "./harness.mjs";

const [wt, runDir, helpRun] = process.argv.slice(2);
const H = setup(wt, runDir);
const { cli, docs, both, crashed, newWorkspace, payment, listFiles } = H;

const pages = JSON.parse(fs.readFileSync(path.join(helpRun, "help-tree.json"), "utf8"));
const raw = fs.readFileSync(path.join(helpRun, "help-tree.txt"), "utf8");
const helpOf = (p) => {
  const start = raw.indexOf(`===== hardkas ${p} --help`);
  if (start < 0) return "";
  const next = raw.indexOf("\n===== hardkas ", start + 10);
  return raw.slice(start, next < 0 ? undefined : next);
};

// Long-running, interactive, server or install commands: not swept (listed in the results as skipped).
const SKIP = new Set(["up", "sandbox", "console", "local wizard", "telemetry tail", "toolchain install", "torture matrix", "torture replay", "chaos replay", "test"]);
const leaves = pages.filter((p) => p.subcommands.length === 0 && p.path && !SKIP.has(p.path));
const skipped = pages.filter((p) => p.subcommands.length === 0 && SKIP.has(p.path)).map((p) => p.path);

const bogusArgs = (usage) => {
  const m = (usage ?? "").replace(/^hardkas\s+/, "");
  return [...m.matchAll(/<([^>]+)>/g)].map((x) => x[1]).map((n) => (n === "name" && /^task /.test(m) ? "no-such-task" : `nonexistent-${n.replace(/[^a-zA-Z0-9]/g, "")}`));
};

const errorShown = (r) => /✗|\bError\b|\bfailed\b|\bFAILED\b|not found|invalid|refused|cannot|Cannot/i.test(both(r));

const sweepDir = path.join(runDir, "sweep");
fs.mkdirSync(sweepDir, { recursive: true });
const usedWs = await newWorkspace(path.join("sweep", "used-ws"));
const pay = payment(usedWs, "sw");

const rows = [];
let n = 0;
for (const leaf of leaves) {
  const help = helpOf(leaf.path);
  const hasJson = /--json\b/.test(help);
  const args = [...leaf.path.split(" ").filter((t) => t !== "<name>"), ...bogusArgs(leaf.usage)];
  if (leaf.path === "task <name>") args.splice(0, args.length, "task", "no-such-task");
  for (const where of ["empty", "used"]) {
    n++;
    const cwd = where === "empty" ? path.join(sweepDir, `e${String(n).padStart(3, "0")}`) : usedWs;
    if (where === "empty") fs.mkdirSync(cwd, { recursive: true });
    const before = new Set(fs.readdirSync(sweepDir));
    const beforeRoot = new Set(fs.readdirSync(runDir));
    const beforeRuns = new Set(fs.readdirSync(path.dirname(runDir)));
    const full = hasJson ? [...args, "--json"] : args;
    const r = cli(full, cwd, { timeout: 60_000 });
    const after = [
      ...fs.readdirSync(sweepDir).filter((x) => !before.has(x)).map((x) => `sweep/${x}`),
      ...fs.readdirSync(runDir).filter((x) => !beforeRoot.has(x) && x !== "network.log").map((x) => `<run>/${x}`),
      ...fs.readdirSync(path.dirname(runDir)).filter((x) => !beforeRuns.has(x)).map((x) => `<runs>/${x}`)
    ];
    const out = docs(r.stdout);
    const failDoc = out.find((d) => d?.ok === false);
    const classes = [];
    if (r.signal || r.status === null) classes.push("HANG");
    if (r.status === 0 && (failDoc || (!hasJson && errorShown(r) && !/^\s*$/.test(r.stderr)))) classes.push("EXIT0_ON_ERROR");
    if (hasJson && r.status !== 0 && failDoc && (!failDoc.code || failDoc.code === "UNKNOWN_ERROR")) classes.push("UNTYPED");
    if (hasJson && !r.signal && out.length === 0) classes.push("JSON_MISSING");
    if (hasJson && out.length > 1) classes.push("JSON_MULTI");
    if (crashed(r)) classes.push("CRASH");
    if ((typeof r.status === "number" && (r.status > 255 || r.status < 0)) || /Assertion failed/.test(r.stderr)) classes.push("NATIVE_CRASH");
    if (after.length) classes.push("STRAY_WRITE");
    rows.push({
      cmd: full.join(" "),
      where,
      exit: r.status,
      signal: r.signal ?? null,
      ms: r.ms,
      json: hasJson,
      code: failDoc?.code ?? (/\[([A-Z][A-Z0-9_]+)\]/.exec(both(r))?.[1] ?? null),
      classes,
      stray: after,
      out: classes.length ? (r.stdout.slice(0, 600) + (r.stderr ? "\n[stderr]\n" + r.stderr.slice(0, 600) : "")) : undefined
    });
    console.log(`${String(n).padStart(3)} ${where.padEnd(5)} exit ${String(r.status).padEnd(4)} ${classes.join(",").padEnd(22)} hardkas ${full.join(" ")}`.slice(0, 220));
  }
}

const by = {};
for (const r of rows) for (const c of r.classes) (by[c] ??= []).push(`${r.where}: hardkas ${r.cmd} → exit ${r.exit}${r.code ? " " + r.code : ""}`);
const head = (await import("node:child_process")).execFileSync("git", ["-C", wt, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const { networkSummary } = await import("../../cut33-reaudit/hermetic-env.mjs");
fs.writeFileSync(path.join(runDir, "results.json"), JSON.stringify({ wt, head, at: new Date().toISOString(), usedWorkspacePayment: pay.steps, skipped, counts: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.length])), byClass: by, rows, network: networkSummary(H.netLog) }, null, 2));
console.log(`\nleaves swept ${leaves.length} (runs ${rows.length}); skipped ${skipped.join(", ")}`);
for (const [k, v] of Object.entries(by)) console.log(`${k}: ${v.length}`);
const net = networkSummary(H.netLog);
console.log(`network: refused ${net.refused.length}; non-loopback ${net.refused.filter((x) => !/LOOPBACK_PORT/.test(x)).length}; loopback ${JSON.stringify(net.loopback)}`);
fs.rmSync(H.home, { recursive: true, force: true });
