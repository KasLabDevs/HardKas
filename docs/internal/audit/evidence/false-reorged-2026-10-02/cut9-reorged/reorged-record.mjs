// False REORGED · the RECORD run (design: REORGED-DESIGN.md; GO 2-oct with the reviewer's conditions).
// Real transfers on the canonical localnet, sent and waited for with the HardKAS CLI built from HEAD
// (the user's flow), while an independent recorder asks the node directly — kaspa-wasm RpcClient,
// no HardKAS observer/derivation code — what the transaction's real state is. The recorder is the
// authority for classification; HardKAS's states are what is under test and are only recorded.
// Throwaway accounts in a throwaway project (never the demo's); keys never printed (AUD-21).
// The demo's miner is snapshotted by the caller and restored at the end (finally) with its own args.
// usage: node reorged-record.mjs <wtRoot> <workDir> <outDir> [N] [maxMinutes]
// env: HARDKAS_HOME = a copy of the gate home (pinned kaspa-wasm, no download)
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [wtArg, workArg, outArg, nArg, maxMinArg] = process.argv.slice(2);
const wt = path.resolve(wtArg);
const work = path.resolve(workArg);
const out = path.resolve(outArg);
const N = Number(nArg ?? 20);
const MAX_MS = Number(maxMinArg ?? 40) * 60_000;
const CLI = path.join(wt, "packages", "cli", "dist", "index.js");
const WAIT_TIMEOUT_S = 150;
const AFTER_REORGED_MS = 45_000;
const AFTER_OK_MS = 4_000;
const SAMPLE_GAP_MS = 250;
fs.mkdirSync(out, { recursive: true });
const t0 = Date.now();
const now = () => Date.now() - t0;
const iso = () => new Date().toISOString();
const log = (...a) => {
  const line = `[${(now() / 1000).toFixed(1)}s] ${a.join(" ")}`;
  console.log(line);
  fs.appendFileSync(path.join(out, "run.log"), line + "\n");
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const msg = (e) => String(e?.message ?? e).replace(/\s+/g, " ").slice(0, 400);
const errors = [];
process.on("uncaughtException", (e) => errors.push({ at: now(), where: "uncaughtException", error: msg(e?.stack ?? e) }));
process.on("unhandledRejection", (e) => errors.push({ at: now(), where: "unhandledRejection", error: msg(e?.stack ?? e) }));
const save = (name, value) =>
  fs.writeFileSync(path.join(out, name), JSON.stringify(value, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2));

// kaspa-wasm (the official SDK) through HardKAS's pinned-toolchain loader; nothing else of HardKAS below.
const req = createRequire(path.join(wt, "packages", "kaspa-rpc", "package.json"));
const ws = req("ws");
globalThis.WebSocket = ws.WebSocket ?? ws;
const core = await import(pathToFileURL(path.join(wt, "packages", "core", "dist", "index.js")).href);
const k = core.loadManagedKaspaWasmSync();
const RPC_URL = core.nodeRpcUrl();
const NODE = core.CANONICAL_LOCALNET.containerName;
const MINER = core.CANONICAL_LOCALNET.minerContainerName;
const MINER_IMAGE = core.CPUMINER_REFERENCE_IMAGE;
const RPC_PORT = String(core.CANONICAL_LOCALNET.ports.rpc);

// ---- the HardKAS CLI (built from HEAD), run as a user would ------------------------------------------
let proj = work;
function cli(args, { cwd = proj, env = {}, timeoutMs = 300_000 } = {}) {
  return new Promise((resolve) => {
    const startedAt = now();
    const child = spawn(process.execPath, [CLI, ...args], { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    const lines = [];
    let buf = "";
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      const s = d.toString();
      stdout += s;
      buf += s;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const l = buf.slice(0, i).replace(/\r$/, "");
        buf = buf.slice(i + 1);
        if (l.trim()) lines.push({ at: now(), iso: iso(), line: l });
      }
    });
    child.stderr.on("data", (d) => (stderr += d.toString()));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (buf.trim()) lines.push({ at: now(), iso: iso(), line: buf.trim() });
      resolve({ args, code, startedAt, endedAt: now(), stdout, stderr: stderr.slice(-4000), lines });
    });
  });
}
const parseJson = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(s.slice(a, b + 1));
      } catch {}
    }
    const c = s.indexOf("[");
    const d = s.lastIndexOf("]");
    if (c >= 0 && d > c) {
      try {
        return JSON.parse(s.slice(c, d + 1));
      } catch {}
    }
    return null;
  }
};
// Run 1 fault (kept): a depth-first search for any "txId"/"transactionId" returned the plan's first
// INPUT outpoint (the funding transaction), so every transfer was waited for under the wrong id.
// Now: the receipt's or the signed transaction's own txId, confirmed against the hardkas.txSubmission.v1
// the send wrote into the workspace.
const HEX64 = /^[0-9a-f]{64}$/;
function submissionTxIds() {
  const ids = new Map();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json")) {
        try {
          const j = JSON.parse(fs.readFileSync(p, "utf8"));
          if (j?.schema === "hardkas.txSubmission.v1" && HEX64.test(j?.txId ?? "")) ids.set(j.txId, { file: path.relative(proj, p), accepted: j?.submitResult?.accepted ?? null, rpcUrl: j?.rpcUrl ?? null });
        } catch {}
      }
    }
  };
  if (fs.existsSync(path.join(proj, ".hardkas"))) walk(path.join(proj, ".hardkas"));
  return ids;
}
function sentTxId(sent, before) {
  const candidates = [
    ["data.receipt.txId", sent?.data?.receipt?.txId],
    ["data.signed.txId", sent?.data?.signed?.txId]
  ].filter(([, v]) => typeof v === "string" && HEX64.test(v));
  const after = submissionTxIds();
  const fresh = [...after.keys()].filter((id) => !before.has(id));
  for (const [source, id] of candidates) if (after.has(id)) return { txId: id, source, submission: after.get(id), freshSubmissions: fresh };
  return { txId: null, source: null, candidates, freshSubmissions: fresh };
}
const STATES = /\b(REJECTED_BY_NODE|SUBMITTED|MEMPOOL_ACCEPTED|MEMPOOL_ORPHAN|ACCEPTED|CONFIRMED|FINALIZED|REORGED|UNOBSERVABLE_PRUNED|INSUFFICIENT_EVIDENCE|CONFLICTING_OBSERVATIONS|NOT_ON_CHAIN)\b/;

// ---- the localnet as found: leave it that way at the end ----------------------------------------------
const running = (name) => {
  try {
    return execFileSync("docker", ["inspect", "-f", "{{.State.Running}}", name]).toString().trim() === "true";
  } catch {
    return false;
  }
};
// "found-stopped": the localnet was stopped before run 1 (which started it and could not stop it again).
const nodeWasRunning = process.argv[7] === "found-stopped" ? false : running(NODE);
if (!nodeWasRunning) {
  execFileSync("docker", ["start", NODE], { stdio: "ignore" });
  log(`node ${NODE} was stopped: started it for the run (it is stopped again at the end)`);
}

// ---- the independent recorder: the node, directly ---------------------------------------------------
const rpc = new k.RpcClient({ url: RPC_URL, encoding: k.Encoding.SerdeJson, networkId: "simnet" });
for (let attempt = 1; ; attempt++) {
  try {
    await rpc.connect({ blockAsyncConnect: true, strategy: "fallback", timeoutDuration: 15000 });
    break;
  } catch (e) {
    if (attempt >= 20) throw e;
    await sleep(3000);
  }
}
const prop = (o, ...names) => {
  for (const n of names) {
    try {
      const v = o?.[n];
      if (v !== undefined && v !== null) return v;
    } catch {}
  }
  return undefined;
};
async function header(hash) {
  try {
    const r = await rpc.getBlock({ hash, includeTransactions: false });
    const b = prop(r, "block") ?? r;
    const h = prop(b, "header");
    const vd = prop(b, "verboseData");
    return {
      hash,
      blueScore: String(prop(h, "blueScore", "blue_score") ?? ""),
      daaScore: String(prop(h, "daaScore", "daa_score") ?? ""),
      isChainBlock: prop(vd, "isChainBlock", "is_chain_block") ?? null,
      selectedParentHash: prop(vd, "selectedParentHash", "selected_parent_hash") ?? null
    };
  } catch (e) {
    return { hash, error: msg(e) };
  }
}
const vchain = async (startHash) => {
  const r = await rpc.getVirtualChainFromBlock({ startHash, includeAcceptedTransactionIds: true });
  return {
    removed: (prop(r, "removedChainBlockHashes") ?? []).map(String),
    added: (prop(r, "addedChainBlockHashes") ?? []).map(String),
    accepted: (prop(r, "acceptedTransactionIds") ?? []).map((a) => ({
      block: String(prop(a, "acceptingBlockHash") ?? ""),
      ids: (prop(a, "acceptedTransactionIds") ?? []).map(String)
    }))
  };
};
async function mempoolState(txId) {
  try {
    const r = await rpc.getMempoolEntry({ transactionId: txId, includeOrphanPool: true, filterTransactionPool: false });
    const e = prop(r, "mempoolEntry", "entry") ?? r;
    if (!e) return "absent";
    return prop(e, "isOrphan") === true ? "orphan" : "present";
  } catch (e) {
    return /not ?found|no entry|does not exist/i.test(msg(e)) ? "absent" : `error: ${msg(e)}`;
  }
}
async function outputsAt(address, txId) {
  const r = await rpc.getUtxosByAddresses({ addresses: [address] });
  const entries = prop(r, "entries") ?? r ?? [];
  let n = 0;
  for (const u of Array.isArray(entries) ? entries : []) {
    const o = prop(u, "outpoint") ?? prop(prop(u, "entry"), "outpoint");
    if (o && String(prop(o, "transactionId") ?? "").toLowerCase() === txId) n++;
  }
  return n;
}

async function recordTx(tx, stop) {
  tx.samples = [];
  tx.events = [];
  tx.truthStartHistory = [{ at: now(), start: tx.truthStart }];
  let lastAccepting = null;
  let lastMempool = null;
  while (!stop.done) {
    const s = { at: now(), iso: iso() };
    try {
      const dag = await rpc.getBlockDagInfo();
      s.sink = String(prop(dag, "sink") ?? "");
      s.daa = String(prop(dag, "virtualDaaScore") ?? "");
      s.mempool = await mempoolState(tx.txId);
      const vc = await vchain(tx.truthStart);
      const hit = vc.accepted.find((a) => a.ids.includes(tx.txId));
      s.accepting = hit ? hit.block : null;
      s.startRemoved = vc.removed.includes(tx.truthStart);
      s.chainLen = vc.added.length;
      s.outputs = await outputsAt(tx.recipient, tx.txId);
      if (s.accepting !== lastAccepting) {
        const ev = { at: s.at, iso: s.iso, kind: "accepting", from: lastAccepting, to: s.accepting, sink: s.sink, daa: s.daa, outputs: s.outputs, mempool: s.mempool };
        if (lastAccepting) {
          // The query HardKAS's observer makes with previousAcceptingBlockHash, asked of the node now.
          try {
            const fp = await vchain(lastAccepting);
            const reHit = fp.accepted.find((a) => a.ids.includes(tx.txId));
            ev.fromPrevious = {
              prevInRemoved: fp.removed.includes(lastAccepting),
              removed: fp.removed,
              addedCount: fp.added.length,
              reAcceptedIn: reHit ? reHit.block : null,
              reAcceptedOnAddedChain: reHit ? fp.added.includes(reHit.block) : false
            };
          } catch (e) {
            ev.fromPrevious = { error: msg(e) };
          }
          ev.prevHeader = await header(lastAccepting);
        }
        if (s.accepting) {
          ev.header = await header(s.accepting);
          // Keep later scans short: start from the accepting block's chain predecessor.
          const i = vc.added.indexOf(s.accepting);
          const pred = i > 0 ? vc.added[i - 1] : tx.truthStart;
          if (pred !== tx.truthStart) {
            tx.truthStart = pred;
            tx.truthStartHistory.push({ at: now(), start: pred });
          }
        }
        tx.events.push(ev);
        lastAccepting = s.accepting;
      }
      if (s.mempool !== lastMempool) {
        tx.events.push({ at: s.at, iso: s.iso, kind: "mempool", from: lastMempool, to: s.mempool, accepting: s.accepting });
        lastMempool = s.mempool;
      }
    } catch (e) {
      s.error = msg(e);
    }
    tx.samples.push(s);
    await sleep(SAMPLE_GAP_MS);
  }
}

function observationsOf(txId) {
  const found = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json")) {
        try {
          const j = JSON.parse(fs.readFileSync(p, "utf8"));
          if (j?.schema === "hardkas.txObservation.v1" && j?.subject?.txId === txId) found.push({ file: path.relative(proj, p), ...j });
        } catch {}
      }
    }
  };
  if (fs.existsSync(path.join(proj, ".hardkas"))) walk(path.join(proj, ".hardkas"));
  return found.sort((a, b) => (String(a.observedAt) < String(b.observedAt) ? -1 : 1));
}

function minerRun(address) {
  execFileSync("docker", ["rm", "-f", MINER], { stdio: "ignore" });
  execFileSync("docker", ["run", "-d", "--name", MINER, "--network", `container:${NODE}`, MINER_IMAGE, "-a", address, "-s", "127.0.0.1", "-p", RPC_PORT, "--mine-when-not-synced", "-t", "1", "--throttle", "12"], { stdio: "ignore" });
}
// The demo's miner container comes back with its own image and arguments. If the localnet was stopped
// when the run began it is only created, not started (starting it would mine to the demo's address),
// and the node is stopped again.
// Run 1 fault (kept): PowerShell 5.1 wrote the `docker inspect` snapshot as UTF-16 with a BOM.
function readSnapshot(file) {
  const buf = fs.readFileSync(file);
  let text = buf[0] === 0xff && buf[1] === 0xfe ? buf.subarray(2).toString("utf16le") : buf.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return JSON.parse(text);
}
function restoreDemoMiner() {
  const snap = readSnapshot(path.join(path.dirname(out), "miner-before.json"))[0];
  const cmd = snap.Config.Cmd;
  execFileSync("docker", ["rm", "-f", MINER], { stdio: "ignore" });
  execFileSync("docker", [nodeWasRunning ? "run" : "create", ...(nodeWasRunning ? ["-d"] : []), "--name", MINER, "--network", `container:${NODE}`, snap.Config.Image, ...cmd], { stdio: "ignore" });
  if (!nodeWasRunning) execFileSync("docker", ["stop", NODE], { stdio: "ignore" });
  return { image: snap.Config.Image, cmd, started: nodeWasRunning, nodeStoppedAgain: !nodeWasRunning };
}

// ---- the run ---------------------------------------------------------------------------------------------
const run = { startedAt: iso(), wt, cliHead: execFileSync("git", ["-C", wt, "rev-parse", "HEAD"]).toString().trim(), N, setup: {}, txs: [], errors };
try {
  const server = await rpc.getServerInfo();
  run.node = { serverVersion: String(prop(server, "serverVersion") ?? ""), networkId: String(prop(server, "networkId") ?? "") };
  fs.mkdirSync(work, { recursive: true });
  const init = await cli(["init", "reorg-proj", "--json"], { cwd: work });
  proj = path.join(work, "reorg-proj");
  run.setup.init = { code: init.code, ms: init.endedAt - init.startedAt };
  const gen = await cli(["accounts", "real", "generate", "--name", "reorg", "--count", "2", "--unsafe-plaintext", "--yes", "--json"]);
  const accounts = parseJson(gen.stdout);
  run.setup.generate = { code: gen.code, accounts: Array.isArray(accounts) ? accounts.map((a) => ({ name: a.name, address: a.address, storage: a.storage })) : gen.stdout.slice(0, 400) };
  if (!Array.isArray(accounts) || accounts.length < 2) throw new Error(`account generation failed: ${gen.stderr.slice(-400)}`);
  const [sender, recipient] = accounts;
  log(`accounts: sender ${sender.name} ${sender.address}, recipient ${recipient.name} ${recipient.address}`);
  const fund = await cli(["localnet", "fund", sender.name, "--amount", "30", "--keep-miner", "--json"], { env: { HARDKAS_TOCCATA_MINER_THROTTLE_MS: "12" }, timeoutMs: 600_000 });
  run.setup.fund = { code: fund.code, ms: fund.endedAt - fund.startedAt, result: parseJson(fund.stdout)?.status ?? fund.stdout.slice(-300), stderr: fund.stderr.slice(-600) };
  log(`fund: code ${fund.code} ${run.setup.fund.result}`);
  if (fund.code !== 0) throw new Error("funding failed");
  // Mining goes on at the same pace (throttle 12) to an address nobody reads, so the sender holds only its funding.
  const burner = new k.PrivateKey(crypto.randomBytes(32).toString("hex")).toAddress("simnet").toString();
  minerRun(burner);
  run.setup.miner = { address: burner, throttleMs: 12, note: "burner address, key discarded" };
  save("run.json", run);

  for (let i = 1; i <= N && now() < MAX_MS; i++) {
    const tx = { index: i, recipient: recipient.address };
    const dag = await rpc.getBlockDagInfo();
    tx.submitSink = String(prop(dag, "sink"));
    tx.submitDaa = String(prop(dag, "virtualDaaScore"));
    tx.truthStart = tx.submitSink;
    const before = submissionTxIds();
    const send = await cli(["tx", "send", "--from", sender.name, "--to", recipient.address, "--amount", "1", "--network", "simnet", "--json"]);
    const sent = parseJson(send.stdout);
    const id = sentTxId(sent, before);
    tx.send = { code: send.code, ms: send.endedAt - send.startedAt, outcome: sent?.outcome ?? null, txIdSource: id.source, submission: id.submission ?? null, freshSubmissions: id.freshSubmissions, stderr: send.code === 0 ? undefined : send.stderr.slice(-800) };
    tx.txId = id.txId;
    tx.sentAt = now();
    if (!tx.txId || send.code !== 0) {
      log(`tx ${i}: send failed (code ${send.code}) ${msg(send.stderr)}`);
      run.txs.push({ index: i, failedSend: tx.send });
      save("run.json", run);
      await sleep(3000);
      continue;
    }
    log(`tx ${i}: ${tx.txId} submitted`);
    const stop = { done: false };
    const recording = recordTx(tx, stop);
    const wait = await cli(["tx", "wait", tx.txId, "--until", "confirmed", "--interval", "1", "--timeout", String(WAIT_TIMEOUT_S)], { timeoutMs: (WAIT_TIMEOUT_S + 60) * 1000 });
    const waitStates = wait.lines.map((l) => ({ at: l.at, iso: l.iso, state: (STATES.exec(l.line) ?? [])[1] ?? null, line: l.line.slice(0, 300) }));
    const tail = (wait.stderr.match(STATES) ?? [])[1] ?? null;
    tx.hardkas = { wait: { code: wait.code, startedAt: wait.startedAt, endedAt: wait.endedAt, states: waitStates, stderrTail: wait.stderr.slice(-1200), stderrState: tail } };
    const sawReorged = waitStates.some((s) => s.state === "REORGED") || tail === "REORGED";
    const until = now() + (sawReorged || wait.code !== 0 ? AFTER_REORGED_MS : AFTER_OK_MS);
    tx.hardkas.statusLooks = [];
    while (now() < until) {
      const st = await cli(["tx", "status", tx.txId, "--json"]);
      const j = parseJson(st.stdout);
      tx.hardkas.statusLooks.push({ at: st.endedAt, code: st.code, state: j?.derived?.status ?? j?.state ?? j?.status ?? (STATES.exec(st.stdout) ?? [])[1] ?? null, acceptingBlockHash: j?.derived?.acceptingBlockHash ?? null });
      await sleep(3000);
    }
    stop.done = true;
    await recording;
    tx.hardkas.observations = observationsOf(tx.txId).map((o) => ({
      file: o.file,
      observedAt: o.observedAt,
      point: o.point,
      finding: o.finding,
      evidence: (o.evidence ?? []).map((e) => ({ method: e.method, params: e.params }))
    }));
    // Blue scores of every cursor HardKAS scanned from, read now (blocks are still served).
    const cursors = [...new Set(tx.hardkas.observations.map((o) => o.finding?.scannedFrom).filter(Boolean))];
    tx.cursorHeaders = {};
    for (const c of cursors) tx.cursorHeaders[c] = await header(c);
    const final = tx.samples[tx.samples.length - 1] ?? {};
    tx.finalTruth = { accepting: final.accepting ?? null, outputs: final.outputs ?? null, mempool: final.mempool ?? null, daa: final.daa ?? null };
    const lastState = tx.hardkas.statusLooks.at(-1)?.state ?? waitStates.filter((s) => s.state).at(-1)?.state ?? tail;
    log(`tx ${i}: wait code ${wait.code}, HardKAS states ${[...new Set(waitStates.map((s) => s.state).filter(Boolean))].join(" → ")}${sawReorged ? " [REORGED seen]" : ""}, last ${lastState}; truth accepting-block changes ${tx.events.filter((e) => e.kind === "accepting").length}, final accepted ${!!final.accepting}, outputs ${final.outputs}`);
    fs.writeFileSync(path.join(out, `tx-${String(i).padStart(2, "0")}.json`), JSON.stringify(tx, null, 2));
    run.txs.push({ index: i, txId: tx.txId, file: `tx-${String(i).padStart(2, "0")}.json`, sawReorged, waitCode: wait.code, lastState, acceptingChanges: tx.events.filter((e) => e.kind === "accepting").length });
    save("run.json", run);
  }
} catch (e) {
  errors.push({ at: now(), where: "run", error: msg(e?.stack ?? e) });
  log(`run error: ${msg(e)}`);
} finally {
  try {
    run.restoredMiner = restoreDemoMiner();
    log(`demo miner restored: ${run.restoredMiner.cmd.join(" ")}`);
  } catch (e) {
    errors.push({ at: now(), where: "restoreDemoMiner", error: msg(e) });
    log(`MINER RESTORE FAILED: ${msg(e)}`);
  }
  await rpc.disconnect().catch(() => {});
  run.finishedAt = iso();
  save("run.json", run);
  log("done");
  process.exit(0);
}
