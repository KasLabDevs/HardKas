// EVENT-LEDGER-2 · AFTER probes beyond the BEFORE set (el2-probes.mjs P1–P4 are re-run unchanged for the comparison).
// Same hermetic harness as the investigation (read-only for the worktree; everything lives under <runDir>):
//   EL2-A6 a LIVE holder of the events append lock for the whole command: typed failure, no takeover, one wait;
//   EL2-A7 the coordinator's own record of a dead holder: what lock list / lock doctor say, and the next command recovers it;
//   EL2-A8 plan → sign --out → send: which artifacts are announced (artifact.written) and under which correlation.
// usage: node --require <wt>/scripts/hermetic/no-network-preload.cjs el2-after-extra.mjs <wt> <runDir> [probeId ...]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setup } from "file:///C:/Users/jrodr/AppData/Local/Temp/claude/C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo/21f9a2e4-33ac-4300-9366-aff402f85900/scratchpad/cut43-mini-reaudit-1/probes/harness.mjs";

const [wt, runDir, ...only] = process.argv.slice(2);
const H = setup(wt, runDir, only);
const { cli, docs, newWorkspace, short, probe, rel } = H;

const ledger = (w) => path.join(w, "events.jsonl");
const lines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean) : []);
const events = (w) => lines(ledger(w)).map((l) => JSON.parse(l));
const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid;
const leaveLock = (w, name, content) => {
  const p = path.join(w, ".hardkas", "locks", name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  const t = new Date(Date.now() - 3_600_000);
  fs.utimesSync(p, t, t);
  return p;
};
const sendArgs = ["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--json"];

probe("EL2-A6-LIVE-HOLDER", "durability", "a live process holds the events append lock for the whole command: typed failure, no takeover, one wait", async () => {
  const w = await newWorkspace("ws-a6");
  const lock = path.join(w, ".hardkas", "locks", "append-events.jsonl.lock");
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  const mineFile = path.join(w, "holder-lock.txt");
  const holder = spawn(
    process.execPath,
    [
      "-e",
      `const fs=require("fs");const fd=fs.openSync(${JSON.stringify(lock)},"wx");const mine=JSON.stringify({pid:process.pid,time:new Date().toISOString()});` +
        `fs.writeSync(fd,mine);fs.closeSync(fd);fs.writeFileSync(${JSON.stringify(mineFile)},mine);setTimeout(()=>{},600000);`
    ],
    { stdio: "ignore", windowsHide: true }
  );
  try {
    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(mineFile) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    const mine = fs.readFileSync(mineFile, "utf8");
    const before = lines(ledger(w)).length;
    const r = cli(sendArgs, w, { timeout: 300_000 });
    const env = docs(r.stdout).find((d) => d?.ok === false);
    const intact = fs.existsSync(lock) && fs.readFileSync(lock, "utf8") === mine;
    const ok = r.status !== 0 && env?.code === "EVENT_LEDGER_APPEND_FAILED" && intact && lines(ledger(w)).length === before && r.ms < 40_000;
    return {
      verdict: ok ? "OK" : "DEFECT",
      sev: ok ? undefined : "high",
      why: `exit ${r.status} in ${r.ms} ms; code ${env?.code}; holder lock intact: ${intact}; ledger ${before} → ${lines(ledger(w)).length}; message: ${String(env?.message).slice(0, 260)}`,
      evidence: { run: short(r, 1200) }
    };
  } finally {
    holder.kill();
  }
});

probe("EL2-A7-LOCK-TOOLS-TRUTH", "operability", "the coordinator's record of a dead holder: lock list / lock doctor say stale; the next command recovers it", async () => {
  const w = await newWorkspace("ws-a7");
  const record = JSON.stringify({ schema: "hardkas.lock.v1", name: "append-events.jsonl", pid: deadPid(), command: "node hardkas tx send", cwd: w, hostname: os.hostname(), createdAt: new Date(Date.now() - 3_600_000).toISOString(), expiresAt: null });
  const lock = leaveLock(w, "append-events.jsonl.lock", record);
  const list = cli(["lock", "list", "--json"], w);
  const mine = docs(list.stdout)[0]?.result?.find((l) => l.name === "append-events.jsonl");
  const doctor = cli(["lock", "doctor"], w);
  const legacy = leaveLock(w, "append-telemetry.jsonl.lock", JSON.stringify({ pid: deadPid(), time: new Date(Date.now() - 3_600_000).toISOString() }));
  const list2 = cli(["lock", "list", "--json"], w);
  const legacyEntry = docs(list2.stdout)[0]?.result?.find((l) => l.name === "append-telemetry.jsonl");
  const next = cli(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--out", "p.json", "--json"], w, { timeout: 300_000 });
  const after = docs(cli(["lock", "list", "--json"], w).stdout)[0]?.result ?? null;
  const ok = mine?.liveness === "stale" && mine?.isAlive === false && /Stale lock found: append-events\.jsonl/.test(doctor.stdout) && legacyEntry?.liveness === "unverifiable" && next.status === 0 && !fs.existsSync(lock) && Array.isArray(after) && after.length === 0;
  return {
    verdict: ok ? "OK" : "DEFECT",
    sev: ok ? undefined : "medium",
    why: `lock list: liveness ${mine?.liveness}, isAlive ${mine?.isAlive}, host ${mine?.metadata?.hostname}; doctor: ${JSON.stringify(doctor.stdout.trim().split(/\r?\n/).filter((l) => /Stale|verified|lock\(s\)/.test(l)).join(" | ")).slice(0, 300)}; legacy telemetry lock: ${legacyEntry?.liveness}; next command exit ${next.status} in ${next.ms} ms; events lock left: ${fs.existsSync(lock)}; telemetry lock left: ${fs.existsSync(legacy)}; locks after: ${JSON.stringify(after)}`,
    evidence: { list: short(list, 800), doctor: short(doctor, 800), list2: short(list2, 800), next: short(next, 300) }
  };
});

probe("EL2-A8-ANNOUNCED-ARTIFACTS", "evidence", "plan → sign --out → send: every artifact written is announced (artifact.written) under its own workflowId", async () => {
  const w = await newWorkspace("ws-a8");
  const plan = cli(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--out", "p-plan.json", "--json"], w);
  const sign = cli(["tx", "sign", "p-plan.json", "--out", "p-signed.json", "--json"], w);
  const send = cli(["tx", "send", "p-signed.json", "--network", "simulated", "--json"], w);
  const planDoc = JSON.parse(fs.readFileSync(path.join(w, "p-plan.json"), "utf8"));
  const signedDoc = JSON.parse(fs.readFileSync(path.join(w, "p-signed.json"), "utf8"));
  const sendDoc = docs(send.stdout)[0];
  // the receipt's identity: what the command printed (`data.receipt.contentHash` …), else the receipt file the store holds
  const storeReceipts = H.receipts(w).map((p) => JSON.parse(fs.readFileSync(p, "utf8")).contentHash).filter((h) => typeof h === "string");
  const receiptId =
    sendDoc?.data?.receipt?.contentHash ?? sendDoc?.data?.artifactId ?? sendDoc?.result?.artifactId ?? sendDoc?.artifactId ?? storeReceipts[0];
  const written = events(w).filter((e) => e.kind === "artifact.written").map((e) => ({ id: e.artifactId.slice(0, 12), file: rel(w, e.payload.path), wf: e.workflowId, src: e.sourceSubsystem }));
  const kinds = events(w).reduce((k, e) => ((k[e.kind] = (k[e.kind] ?? 0) + 1), k), {});
  const planAnnounced = written.filter((x) => x.id === planDoc.contentHash.slice(0, 12));
  const signedAnnounced = written.filter((x) => x.id === signedDoc.contentHash.slice(0, 12));
  const receiptAnnounced = typeof receiptId === "string" ? written.filter((x) => x.id === receiptId.slice(0, 12)) : [];
  const ok = [plan, sign, send].every((r) => r.status === 0) && planAnnounced.length >= 2 && signedAnnounced.length >= 2 && receiptAnnounced.length >= 1 && planAnnounced.every((x) => x.wf === planDoc.workflowId);
  return {
    verdict: ok ? "OK" : "DEFECT",
    sev: ok ? undefined : "medium",
    why: `exits ${[plan.status, sign.status, send.status]}; kinds ${JSON.stringify(kinds)}; plan announced ×${planAnnounced.length} (${planAnnounced.map((x) => `${x.file} by ${x.src}`).join(", ")}); signed ×${signedAnnounced.length} (${signedAnnounced.map((x) => `${x.file} by ${x.src}`).join(", ")}); receipt ${receiptId ? receiptId.slice(0, 12) : "?"} ×${receiptAnnounced.length} (${receiptAnnounced.map((x) => `${x.file} by ${x.src}`).join(", ")}); plan workflowId in events: ${planAnnounced.every((x) => x.wf === planDoc.workflowId)}`,
    evidence: { written, kinds, send: short(send, 500) }
  };
});

await H.run();
