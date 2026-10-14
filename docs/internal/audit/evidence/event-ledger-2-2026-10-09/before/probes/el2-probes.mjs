// EVENT-LEDGER-2 · investigation probes (read-only for the worktree; everything lives under <runDir>). Hermetic, same
// harness as MINI-REAUDIT-1. Characterizes, on the current base:
//   EL2-P1 a stale events lock: how long a command takes, how many events it loses, what it says, what is left behind;
//   EL2-P2 what `lock list` / `lock doctor` tell a user about that stale lock (is there any way to find it?);
//   EL2-P3 the same coordinator on telemetry: a stale telemetry lock and a command that logs an anomaly;
//   EL2-P4 which event kinds a plan → sign → send flow and a shortcut send leave in the ledger (EVENT-EMISSION-1);
//   EL2-P5 dag simulate-reorg: what changes, what is recorded.
// usage: node --require <wt>/scripts/hermetic/no-network-preload.cjs el2-probes.mjs <wt> <runDir> [probeId ...]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { setup } from "file:///C:/Users/jrodr/AppData/Local/Temp/claude/C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo/21f9a2e4-33ac-4300-9366-aff402f85900/scratchpad/cut43-mini-reaudit-1/probes/harness.mjs";

const [wt, runDir, ...only] = process.argv.slice(2);
const H = setup(wt, runDir, only);
const { cli, docs, both, newWorkspace, payment, short, probe, tree, treeDiff, rel } = H;

const ledger = (w) => path.join(w, "events.jsonl");
const lines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean) : []);
const kindsOf = (w) => {
  const k = {};
  for (const l of lines(ledger(w))) {
    try {
      const j = JSON.parse(l);
      k[j.kind ?? "?"] = (k[j.kind ?? "?"] ?? 0) + 1;
    } catch {
      k["<unparseable>"] = (k["<unparseable>"] ?? 0) + 1;
    }
  }
  return k;
};
const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid;
const leaveLock = (w, name, content) => {
  const p = path.join(w, ".hardkas", "locks", name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  const t = new Date(Date.now() - 3_600_000);
  fs.utimesSync(p, t, t);
  return p;
};

probe("EL2-P1-STALE-EVENTS-LOCK", "durability", "a leftover events append lock (dead holder): time, events lost, output, what is left", async () => {
  const w = await newWorkspace("ws-p1");
  // reference run without the lock: how many events a shortcut send records and how long it takes
  const ref = cli(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--json"], w, { timeout: 300_000 });
  const refEvents = lines(ledger(w)).length;
  const lock = leaveLock(w, "append-events.jsonl.lock", JSON.stringify({ pid: deadPid(), time: new Date(Date.now() - 3_600_000).toISOString() }));
  const before = lines(ledger(w)).length;
  const r = cli(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--json"], w, { timeout: 300_000 });
  const after = lines(ledger(w)).length;
  const next = cli(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--out", "p.json", "--json"], w, { timeout: 300_000 });
  return {
    verdict: r.status === 0 && after === before ? "DEFECT" : "NOTE",
    sev: r.status === 0 && after === before ? "medium" : undefined,
    why: `reference send: exit ${ref.status} ${ref.ms} ms, ${refEvents} ledger lines after it; with the stale lock: exit ${r.status} in ${r.ms} ms, ledger ${before} → ${after}, ok:${docs(r.stdout)[0]?.ok}, stderr ${JSON.stringify(r.stderr.trim().slice(0, 120))}; lock still there: ${fs.existsSync(lock)}; the next command (tx plan): exit ${next.status} in ${next.ms} ms, ledger → ${lines(ledger(w)).length}`,
    evidence: { stale: short(r, 400), next: short(next, 300) }
  };
});

probe("EL2-P2-LOCK-TOOLS", "operability", "what lock list / lock doctor say about a stale events append lock", async () => {
  const w = await newWorkspace("ws-p2");
  leaveLock(w, "append-events.jsonl.lock", JSON.stringify({ pid: deadPid(), time: new Date(Date.now() - 3_600_000).toISOString() }));
  const list = cli(["lock", "list", "--json"], w);
  const doctor = cli(["lock", "doctor", "--json"], w);
  const listHuman = cli(["lock", "list"], w);
  return {
    verdict: "NOTE",
    why: `lock list --json exit ${list.status}: ${JSON.stringify(docs(list.stdout)[0] ?? list.stdout.trim().slice(0, 200)).slice(0, 300)} · lock doctor --json exit ${doctor.status}: ${JSON.stringify(docs(doctor.stdout)[0] ?? doctor.stdout.trim().slice(0, 200)).slice(0, 300)}`,
    evidence: { list: short(list, 600), doctor: short(doctor, 600), listHuman: short(listHuman, 600) }
  };
});

probe("EL2-P3-STALE-TELEMETRY-LOCK", "durability", "the same coordinator on telemetry.jsonl: a stale telemetry lock, then commands that write telemetry", async () => {
  const w = await newWorkspace("ws-p3");
  const ref = cli(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--out", "a.json", "--json"], w);
  const telemetryFiles = H.listFiles(w).filter((p) => /telemetry\.jsonl$/.test(p));
  const lock = leaveLock(w, "append-telemetry.jsonl.lock", JSON.stringify({ pid: deadPid(), time: new Date(Date.now() - 3_600_000).toISOString() }));
  const t0 = new Map(telemetryFiles.map((f) => [f, lines(f).length]));
  // a stale artifacts lock makes the lock layer log a STALE_LOCK_RECOVERY anomaly through telemetry
  leaveLock(w, "artifacts.lock", JSON.stringify({ schema: "hardkas.lock.v1", name: "artifacts", pid: deadPid(), command: "x", cwd: w, hostname: (await import("node:os")).hostname(), createdAt: new Date(Date.now() - 3_600_000).toISOString(), expiresAt: null }));
  const r = cli(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--out", "b.json", "--json"], w, { timeout: 300_000 });
  const grown = [...t0.entries()].map(([f, n]) => `${rel(w, f)} ${n} → ${lines(f).length}`);
  return {
    verdict: "NOTE",
    why: `reference plan ${ref.ms} ms; telemetry files ${telemetryFiles.map((f) => rel(w, f)).join(", ") || "none"}; with stale telemetry + artifacts locks: plan exit ${r.status} in ${r.ms} ms; telemetry ${grown.join("; ") || "-"}; telemetry lock still there: ${fs.existsSync(lock)}`,
    evidence: { run: short(r, 300) }
  };
});

probe("EL2-P4-EVENT-KINDS", "evidence", "EVENT-EMISSION-1: event kinds after plan → sign → send, and after a shortcut send", async () => {
  const w = await newWorkspace("ws-p4");
  payment(w, "k");
  const afterFlow = kindsOf(w);
  cli(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--json"], w);
  const afterShortcut = kindsOf(w);
  return { verdict: "NOTE", why: `after plan → sign → send: ${JSON.stringify(afterFlow)}; after a shortcut send as well: ${JSON.stringify(afterShortcut)}`, evidence: { afterFlow, afterShortcut } };
});

probe("EL2-P5-SIMULATE-REORG", "evidence", "dag simulate-reorg: what changes in the workspace and what is recorded", async () => {
  const w = await newWorkspace("ws-p5");
  payment(w, "r");
  const skip = (p) => /[\\/]locks[\\/]/.test(p);
  const t0 = tree(w, skip);
  const ev0 = lines(ledger(w)).length;
  const r = cli(["dag", "simulate-reorg", "--depth", "1"], w);
  const d = treeDiff(t0, tree(w, skip));
  return {
    verdict: d.added.length === 0 && lines(ledger(w)).length === ev0 && d.changed.length > 0 ? "DEFECT" : "NOTE",
    sev: d.added.length === 0 && lines(ledger(w)).length === ev0 && d.changed.length > 0 ? "low" : undefined,
    why: `exit ${r.status}; changed ${d.changed.map((p) => rel(w, p)).join(", ") || "-"}; added ${d.added.map((p) => rel(w, p)).join(", ") || "-"}; ledger ${ev0} → ${lines(ledger(w)).length}`,
    evidence: { run: short(r, 400) }
  };
});

await H.run();
