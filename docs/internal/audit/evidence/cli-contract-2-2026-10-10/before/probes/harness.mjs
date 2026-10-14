// MINI-REAUDIT-1 · shared harness for the adversarial batteries. Same hermetic rules as scripts/gate-hermetic.mjs and the
// earlier re-audits: a private HARDKAS_HOME (copy of the gate home), Docker unreachable, no non-loopback network, the
// localnet ports and 8545 refused even on loopback (the canonical demo localnet is never touched). Every workspace, home
// and file lives under <runDir>; the worktree is only read. Verdicts:
//   DEFECT (a contract is broken; `sev` says how badly) · OK (the adversarial input was handled) · NOTE (by design or
//   needs a decision) · INCONCLUSIVE (the probe could not decide; never hidden). Every probe keeps its raw evidence.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { hermeticEnv, freshHome, makeCli, networkSummary } from "../../cut33-reaudit/hermetic-env.mjs";

export function setup(wt, runDir, only = []) {
  if (fs.existsSync(runDir)) throw new Error(`${runDir} exists: keep every run, pick a new one`);
  fs.mkdirSync(runDir, { recursive: true });
  const home = freshHome(path.join(runDir, "home"));
  const netLog = path.join(runDir, "network.log");
  const env = hermeticEnv(wt, home, netLog);
  Object.assign(process.env, {
    HARDKAS_HOME: home,
    HARDKAS_HERMETIC_LOG: netLog,
    HARDKAS_HERMETIC_DENY_PORTS: env.HARDKAS_HERMETIC_DENY_PORTS,
    DOCKER_HOST: env.DOCKER_HOST,
    NO_COLOR: "1"
  });
  // the localnet ports and 8545 for every CLI child too (hermeticEnv's list lacks 8545)
  env.HARDKAS_HERMETIC_DENY_PORTS = "16210,17210,18210,16110,17110,18110,8545";
  process.env.HARDKAS_HERMETIC_DENY_PORTS = env.HARDKAS_HERMETIC_DENY_PORTS;
  const cli = makeCli(wt, env);
  const dist = path.join(wt, "packages", "cli", "dist", "index.js");

  /** The CLI as a child process that runs concurrently with others (spawn, not spawnSync). */
  const cliAsync = (args, cwd, opts = {}) =>
    new Promise((resolve) => {
      const t0 = Date.now();
      const child = spawn(process.execPath, [dist, ...args], { cwd, env: opts.env ? { ...env, ...opts.env } : env, windowsHide: true });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      const timer = setTimeout(() => child.kill("SIGKILL"), opts.timeout ?? 120_000);
      if (opts.onSpawn) opts.onSpawn(child);
      child.on("close", (status, signal) => {
        clearTimeout(timer);
        resolve({ args: args.join(" "), cwd, status, signal, ms: Date.now() - t0, stdout, stderr, pid: child.pid });
      });
      child.stdin.end(opts.input ?? "");
    });

  const imp = (pkg) => import(pathToFileURL(path.join(wt, "packages", pkg, "dist", "index.js")).href);
  const listFiles = (dir) => {
    const out = [];
    const walk = (d) => {
      if (!fs.existsSync(d)) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        e.isDirectory() ? walk(p) : out.push(p);
      }
    };
    walk(dir);
    return out;
  };
  /** path → sha256 prefix of every file under dir (to see what a command wrote, changed or removed). */
  const tree = (dir, skip = () => false) => {
    const m = new Map();
    for (const p of listFiles(dir)) {
      if (skip(p)) continue;
      try {
        m.set(p, crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 16));
      } catch {
        m.set(p, "unreadable");
      }
    }
    return m;
  };
  const treeDiff = (a, b) => ({
    added: [...b.keys()].filter((k) => !a.has(k)),
    changed: [...b.keys()].filter((k) => a.has(k) && a.get(k) !== b.get(k)),
    removed: [...a.keys()].filter((k) => !b.has(k))
  });
  const rel = (base, p) => path.relative(base, p).replace(/\\/g, "/");
  const cut = (s, n = 2000) => (s && s.length > n ? s.slice(0, n) + `…[+${s.length - n}]` : s ?? "");
  const short = (r, n) => ({ cmd: `hardkas ${r.args}`, exit: r.status, signal: r.signal ?? null, ms: r.ms, stdout: cut(r.stdout, n), stderr: cut(r.stderr, n), ...(r.error ? { spawnError: r.error } : {}) });
  const tryJson = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  /** Every JSON document a command printed on stdout (one per line block starting with "{"). */
  const docs = (s) => (s ?? "").split(/\r?\n(?=[{\[])/).map((c) => tryJson(c.trim())).filter((d) => d !== undefined);
  const both = (r) => `${r.stdout}\n${r.stderr}`;
  const codeOf = (r) => docs(r.stdout).find((d) => d?.ok === false)?.code ?? /\[([A-Z][A-Z0-9_]+)\]/.exec(both(r))?.[1] ?? null;
  const crashed = (r) => /\n\s+at [^\n]+\([^\n]*:\d+:\d+\)|\b(TypeError|ReferenceError|RangeError|SyntaxError): /.test(both(r));

  const newWorkspace = async (name, network = "simulated") => {
    const ws = path.join(runDir, name);
    fs.mkdirSync(ws, { recursive: true });
    const { Hardkas } = await imp("sdk");
    await Hardkas.create({ cwd: ws, autoBootstrap: true, network });
    return ws;
  };
  /** One simulated payment through the real CLI: plan → sign → send. */
  const payment = (ws, tag = "p", amount = "1", extra = {}) => {
    const plan = cli(["tx", "plan", "--from", extra.from ?? "alice", "--to", extra.to ?? "bob", "--amount", amount, "--network", "simulated", "--out", `${tag}-plan.json`, "--json"], ws);
    const sign = cli(["tx", "sign", `${tag}-plan.json`, "--out", `${tag}-signed.json`, "--json"], ws);
    const send = cli(["tx", "send", `${tag}-signed.json`, "--network", "simulated", "--json"], ws);
    return { plan, sign, send, steps: [plan.status, sign.status, send.status] };
  };
  const storeFiles = (ws) => listFiles(path.join(ws, ".hardkas", "artifacts"));
  const receipts = (ws) => storeFiles(ws).filter((p) => /[\\/]receipts[\\/]/.test(p));

  const results = [];
  const probes = [];
  const probe = (id, area, claim, fn) => probes.push({ id, area, claim, fn });
  const run = async () => {
    for (const p of probes) {
      if (only.length && !only.includes(p.id)) continue;
      const t0 = Date.now();
      let res;
      try {
        res = await p.fn();
      } catch (err) {
        res = { verdict: "INCONCLUSIVE", why: `probe error: ${err?.stack ?? err}` };
      }
      results.push({ id: p.id, area: p.area, claim: p.claim, ms: Date.now() - t0, ...res });
      console.log(`${p.id.padEnd(30)} ${String(res.verdict).padEnd(12)} ${res.sev ? `[${res.sev}] ` : ""}${res.why ?? ""}`.slice(0, 700));
    }
    const head = execFileSync("git", ["-C", wt, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const net = networkSummary(netLog);
    fs.writeFileSync(path.join(runDir, "results.json"), JSON.stringify({ wt, head, at: new Date().toISOString(), network: net, results }, null, 2));
    const count = (v) => results.filter((r) => r.verdict === v).length;
    console.log(`\nverdicts: DEFECT ${count("DEFECT")} · OK ${count("OK")} · NOTE ${count("NOTE")} · INCONCLUSIVE ${count("INCONCLUSIVE")}`);
    console.log(`network: refused ${net.refused.length} ${[...new Set(net.refused)].slice(0, 6).join(" | ")}; non-loopback ${net.refused.filter((x) => !/LOOPBACK_PORT/.test(x)).length}; loopback ${JSON.stringify(net.loopback)}`);
    console.log(`results → ${path.join(runDir, "results.json")}`);
    fs.rmSync(home, { recursive: true, force: true });
  };
  return { env, home, netLog, cli, cliAsync, imp, listFiles, tree, treeDiff, rel, cut, short, tryJson, docs, both, codeOf, crashed, newWorkspace, payment, storeFiles, receipts, probe, run };
}
