// Surface Cut item 3 · events / UtxoContext — live substitution differential, v2.
// v1 (events-diff.mjs, run 1 kept) could not read upstream payloads: they are WASM
// class instances (TransactionRecord needs serialize(), UtxoEntryReference exposes
// getters), so its two upstream observers read 0 outpoints although events arrived.
// v2 reads each payload by its real shape (shape-probe-1.log), adds a fresh control
// subscription after the restart as the phase-2 reference, a transport spy under
// `hardkas.events`, and set-level checks against the node at quiescent points.
// Read-only for the repository: built packages + the canonical localnet.
//
// Observers (same node, same fresh address A):
//   hkEventsAsWired      SDK `hardkas.events` exactly as the SDK wires it (no connect())
//   hkEventsConnected    SDK `hardkas.events` after `events.connect()`
//   toolkitWatch         @hardkas/toolkit WalletSubscriptionManager.watch
//   kaspaRpc             @hardkas/kaspa-rpc JsonWrpcKaspaClient.subscribeToUtxosChanged, idle
//   kaspaRpcTraffic      the same, plus one getBlockDagInfo every 2 s (other traffic on the client)
//   utxoContext          kaspa-wasm UtxoProcessor + UtxoContext, documented reconnect
//                        handling (clear() + trackAddresses() on every later "connect")
//   utxoContextNoReReg   the same without that re-registration
//   rawRpc               kaspa-wasm RpcClient.subscribeUtxosChanged, never resubscribed
//   rawRpcResub          the same, resubscribed on every later "connect"
//   control              fresh RpcClient subscription opened after the node is back
// Ground truth: a fresh kaspa-wasm RpcClient getUtxosByAddresses([A]), taken twice
// (5 s and 8 s after the miner stops) to confirm quiescence.
// usage: node events-diff-v2.mjs <repoRoot> <projectDir> <outFile> [phaseSeconds]
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [repoArg, projectArg, outArg, secondsArg] = process.argv.slice(2);
const repo = path.resolve(repoArg);
const projectDir = path.resolve(projectArg);
const outFile = path.resolve(outArg);
const PHASE_MS = Number(secondsArg ?? 30) * 1000;
const dist = (pkg) => pathToFileURL(path.join(repo, "packages", pkg, "dist", "index.js")).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const now = () => Date.now() - t0;
const log = (...a) => console.log(`[${(now() / 1000).toFixed(1)}s]`, ...a);

const errors = [];
process.on("uncaughtException", (e) => errors.push({ at: now(), where: "uncaughtException", error: String(e?.stack ?? e).slice(0, 400) }));
process.on("unhandledRejection", (e) => errors.push({ at: now(), where: "unhandledRejection", error: String(e?.stack ?? e).slice(0, 400) }));

// kaspa-wasm needs a WebSocket in Node; kaspa-rpc uses `ws` for it (Windows exit abort otherwise).
const req = createRequire(path.join(repo, "packages", "kaspa-rpc", "package.json"));
const ws = req("ws");
globalThis.WebSocket = ws.WebSocket ?? ws;

const core = await import(dist("core"));
const { JsonWrpcKaspaClient } = await import(dist("kaspa-rpc"));
const { WalletSubscriptionManager } = await import(dist("toolkit"));
const sdk = await import(dist("sdk"));
const k = core.loadManagedKaspaWasmSync();
const rpcUrl = core.nodeRpcUrl();
const NODE = core.CANONICAL_LOCALNET.containerName;
const MINER = core.CANONICAL_LOCALNET.minerContainerName;

// Fresh address; its key stays in memory and is never printed.
const A = new k.PrivateKey(crypto.randomBytes(32).toString("hex")).toAddress("simnet").toString();

// ---- payload readers (shapes from shape-probe-1.log) -------------------------------
const HEX64 = /^[0-9a-f]{64}$/i;
const opKey = (txid, index) => {
  const t = txid === undefined || txid === null ? "" : String(txid).toLowerCase();
  return HEX64.test(t) && Number.isInteger(Number(index)) ? `${t}:${Number(index)}` : null;
};
/** Outpoints of UTXO entries: kaspa-wasm UtxoEntryReference (getters) or HardKAS-mapped plain objects. */
function opsOfEntries(list) {
  const out = new Set();
  for (const u of Array.isArray(list) ? list : []) {
    const op = u?.outpoint ?? u?.entry?.outpoint;
    const key = opKey(op?.transactionId ?? op?.txId ?? op?.transaction_id, op?.index);
    if (key) out.add(key);
  }
  return out;
}
/** Outpoints of a wallet TransactionRecord: record id + utxoEntries[].index. */
function opsOfRecord(record) {
  const out = new Set();
  let s;
  try { s = typeof record?.serialize === "function" ? record.serialize() : record; } catch { return out; }
  const id = s?.id;
  const entries = s?.data?.data?.utxoEntries ?? s?.data?.utxoEntries ?? [];
  for (const u of entries) {
    const key = opKey(id, u?.index);
    if (key) out.add(key);
  }
  return out;
}

// ---- observer bookkeeping --------------------------------------------------------------
const marks = { restart: Infinity, nodeBack: Infinity };
const observers = {};
function observer(name) {
  observers[name] ??= {
    notifications: [],
    addedBeforeRestart: new Set(),
    addedAfterBack: new Set(),
    set: new Set(), // added − removed, for observers that report removals
    tracksRemovals: false,
    eventTypes: {},
    connects: [],
    disconnects: [],
    errors: []
  };
  return observers[name];
}
function record(name, added, removed) {
  const o = observer(name);
  const t = now();
  o.notifications.push(t);
  for (const op of added) {
    if (t < marks.restart) o.addedBeforeRestart.add(op);
    if (t >= marks.nodeBack) o.addedAfterBack.add(op);
    o.set.add(op);
  }
  if (removed) {
    o.tracksRemovals = true;
    for (const op of removed) o.set.delete(op);
  }
}
async function guarded(name, fn) {
  try {
    await fn();
  } catch (e) {
    observer(name).errors.push(`setup: ${String(e?.message ?? e).slice(0, 300)}`);
    log(`${name}: setup error`, String(e?.message ?? e).slice(0, 200));
  }
}

function docker(cmd) {
  return execSync(`docker ${cmd}`, { stdio: "ignore" });
}
const startMiner = () => {
  try { docker(`rm -f ${MINER}`); } catch {}
  docker(`run -d --name ${MINER} --network=container:${NODE} ${core.CPUMINER_REFERENCE_IMAGE} --mining-address ${A} --kaspad-address 127.0.0.1 --port ${core.CANONICAL_LOCALNET.ports.rpc} --threads 1 --mine-when-not-synced`);
};
const stopMiner = () => { try { docker(`rm -f ${MINER}`); } catch {} };

/** The node's own view, through a fresh upstream client. */
async function groundTruth() {
  const c = new k.RpcClient({ url: rpcUrl, encoding: k.Encoding.SerdeJson, networkId: "simnet" });
  try {
    await c.connect({ blockAsyncConnect: true, strategy: "fallback", timeoutDuration: 15000 });
    const r = await c.getUtxosByAddresses({ addresses: [A] });
    return opsOfEntries(r?.entries);
  } finally {
    await c.disconnect().catch(() => {});
  }
}
async function quiescentTruth(label) {
  await sleep(5000);
  const a = await groundTruth();
  await sleep(3000);
  const b = await groundTruth();
  log(`${label} ground truth: ${a.size} → ${b.size} UTXOs${a.size === b.size ? "" : " (still moving)"}`);
  return { set: b, first: a.size, second: b.size, stable: a.size === b.size && [...a].every((op) => b.has(op)) };
}
async function waitNode(timeoutMs = 120000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      await groundTruth();
      return true;
    } catch {
      await sleep(1000);
    }
  }
  return false;
}

// ---- observers ------------------------------------------------------------------------
const closers = [];
const spies = {};
/** Counts what reaches `hardkas.events` from below (the SDK's own rpc client) and evaluates the provider's address filter on it. */
function spyTransport(name, hk) {
  const spy = (spies[name] = { remoteSubscribeCalls: 0, deliveries: [], transportAdded: new Set(), filter: null });
  const orig = hk.rpc.subscribeToUtxosChanged.bind(hk.rpc);
  hk.rpc.subscribeToUtxosChanged = async (addresses, handler) => {
    spy.remoteSubscribeCalls++;
    return orig(addresses, (payload) => {
      spy.deliveries.push(now());
      for (const op of opsOfEntries(payload?.added)) spy.transportAdded.add(op);
      if (!spy.filter && payload?.added?.length) {
        const u = payload.added[0];
        // reactive-event-provider.ts: added.map(u => u.scriptPublicKey.scriptPublicKey), removed.map(u => u.transactionId)
        let values, threw = null;
        try {
          values = [...payload.added.map((x) => x.scriptPublicKey.scriptPublicKey), ...payload.removed.map((x) => x.transactionId)];
        } catch (e) {
          threw = String(e?.message ?? e).slice(0, 160);
        }
        spy.filter = {
          addedEntryKeys: Object.keys(u ?? {}),
          scriptPublicKeyType: typeof u?.scriptPublicKey,
          entryAddressIsA: u?.address === A,
          filterValues: values ? [...new Set(values.map((v) => (v === undefined ? "undefined" : typeof v)))] : undefined,
          filterMatchesA: values ? values.includes(A) : false,
          filterThrew: threw
        };
      }
      handler(payload);
    });
  };
}
const hkAsWired = await sdk.Hardkas.open(projectDir);
const hkConnected = await sdk.Hardkas.open(projectDir);
await guarded("hkEventsAsWired", async () => {
  observer("hkEventsAsWired");
  spyTransport("hkEventsAsWired", hkAsWired);
  await hkAsWired.events.subscribe({ type: "utxosChanged", addresses: [A] }, (env) =>
    record("hkEventsAsWired", opsOfEntries(env?.payload?.added), opsOfEntries(env?.payload?.removed)));
});
await guarded("hkEventsConnected", async () => {
  observer("hkEventsConnected");
  spyTransport("hkEventsConnected", hkConnected);
  await hkConnected.events.connect();
  await hkConnected.events.subscribe({ type: "utxosChanged", addresses: [A] }, (env) =>
    record("hkEventsConnected", opsOfEntries(env?.payload?.added), opsOfEntries(env?.payload?.removed)));
});
await guarded("toolkitWatch", async () => {
  observer("toolkitWatch");
  const c = new JsonWrpcKaspaClient({ rpcUrl });
  closers.push(() => c.close?.());
  // One event per new txid, each carrying the whole batch; removals of already-seen txids are deduplicated away.
  const tk = new WalletSubscriptionManager(c, async () => A);
  await tk.watch((ev) => record("toolkitWatch", opsOfEntries(ev?.details?.added)));
});
const kaspaRpcClients = {};
async function kaspaRpcObserver(name, traffic) {
  observer(name);
  const c = new JsonWrpcKaspaClient({ rpcUrl });
  kaspaRpcClients[name] = c;
  closers.push(() => c.close?.());
  await c.subscribeToUtxosChanged([A], (ev) => record(name, opsOfEntries(ev?.added), opsOfEntries(ev?.removed)));
  if (traffic) {
    const timer = setInterval(() => { c.call("getBlockDagInfo", {}).catch(() => {}); }, 2000);
    closers.push(() => clearInterval(timer));
  }
}
await guarded("kaspaRpc", () => kaspaRpcObserver("kaspaRpc", false));
await guarded("kaspaRpcTraffic", () => kaspaRpcObserver("kaspaRpcTraffic", true));

const contexts = {};
async function utxoContextObserver(name, reRegister) {
  const o = observer(name);
  const rpc = new k.RpcClient({ url: rpcUrl, encoding: k.Encoding.SerdeJson, networkId: "simnet" });
  await rpc.connect({ blockAsyncConnect: true });
  const proc = new k.UtxoProcessor({ rpc, networkId: "simnet" });
  const ctx = new k.UtxoContext({ processor: proc });
  const state = { ctx, lastBalance: null, ready: false };
  proc.addEventListener(async (e) => {
    o.eventTypes[e.type] = (o.eventTypes[e.type] ?? 0) + 1;
    if (e.type === "pending" || e.type === "stasis" || e.type === "discovery" || e.type === "maturity") record(name, opsOfRecord(e.data));
    else if (e.type === "reorg") record(name, [], opsOfRecord(e.data));
    else if (e.type === "balance") state.lastBalance = e.data?.balance ?? null;
    else if (e.type === "connect") o.connects.push(now());
    else if (e.type === "disconnect") o.disconnects.push(now());
    if (e.type === "connect" && state.ready && reRegister) {
      try {
        await ctx.clear();
        await ctx.trackAddresses([A]);
      } catch (err) {
        o.errors.push(`re-register: ${String(err?.message ?? err).slice(0, 200)}`);
      }
    }
  });
  await proc.start();
  await ctx.trackAddresses([A]);
  state.ready = true;
  contexts[name] = state;
  closers.push(async () => { await proc.stop(); await rpc.disconnect(); });
}
await guarded("utxoContext", () => utxoContextObserver("utxoContext", true));
await guarded("utxoContextNoReReg", () => utxoContextObserver("utxoContextNoReReg", false));

async function rawObserver(name, resubscribe) {
  const o = observer(name);
  const rpc = new k.RpcClient({ url: rpcUrl, encoding: k.Encoding.SerdeJson, networkId: "simnet" });
  let ready = false;
  rpc.addEventListener("connect", () => {
    o.connects.push(now());
    if (ready && resubscribe) rpc.subscribeUtxosChanged([A]).catch((err) => o.errors.push(`resubscribe: ${String(err?.message ?? err).slice(0, 200)}`));
  });
  rpc.addEventListener("disconnect", () => o.disconnects.push(now()));
  rpc.addEventListener("utxos-changed", (e) => record(name, opsOfEntries(e?.data?.added), opsOfEntries(e?.data?.removed)));
  await rpc.connect({ blockAsyncConnect: true });
  await rpc.subscribeUtxosChanged([A]);
  ready = true;
  closers.push(() => rpc.disconnect());
}
await guarded("rawRpc", () => rawObserver("rawRpc", false));
await guarded("rawRpcResub", () => rawObserver("rawRpcResub", true));
log(`observers ready for ${A.slice(0, 20)}…`);

function heldBy(name) {
  const s = contexts[name];
  if (!s) return null;
  const mature = s.ctx.getMatureRange(0, s.ctx.matureLength);
  const pending = s.ctx.getPending();
  return { listed: opsOfEntries([...mature, ...pending]), mature: mature.length, pending: pending.length, balance: s.lastBalance };
}
function compare(truth, name) {
  const o = observers[name];
  const held = heldBy(name);
  if (held) {
    const b = held.balance;
    return {
      kind: "context",
      mature: held.mature,
      pending: held.pending,
      stasisPerBalanceEvent: b?.stasisUtxoCount ?? null,
      balanceCountTotal: b ? b.matureUtxoCount + b.pendingUtxoCount + b.stasisUtxoCount : null,
      node: truth.size,
      listedNotOnNode: [...held.listed].filter((op) => !truth.has(op)).length,
      onNodeNotListed: [...truth].filter((op) => !held.listed.has(op)).length
    };
  }
  if (o?.tracksRemovals || name === "control" || name.startsWith("raw") || name.startsWith("kaspaRpc")) {
    return {
      kind: "reconstructed (added − removed)",
      held: o.set.size,
      node: truth.size,
      missing: [...truth].filter((op) => !o.set.has(op)).length,
      extra: [...o.set].filter((op) => !truth.has(op)).length
    };
  }
  return null;
}

// ---- phase 1: mine to A ----------------------------------------------------------------
startMiner();
log("phase 1: mining");
await sleep(PHASE_MS);
stopMiner();
const truth1 = await quiescentTruth("phase 1");
const atSnapshot1 = {};
for (const name of Object.keys(observers)) atSnapshot1[name] = compare(truth1.set, name);

// ---- phase 2: node restart, then mine again ---------------------------------------------
marks.restart = now();
log("phase 2: restarting the node");
docker(`restart ${NODE}`);
const back = await waitNode();
marks.nodeBack = now();
log(`node back: ${back}`);
const truthBack = await groundTruth().catch(() => new Set());
log(`ground truth right after the restart: ${truthBack.size} UTXOs`);
await guarded("control", () => rawObserver("control", false));
await sleep(8000); // let every client's reconnect strategy fire
startMiner();
log("phase 2: mining");
await sleep(PHASE_MS);
stopMiner();
const truth2 = await quiescentTruth("phase 2");

// ---- result ------------------------------------------------------------------------------
const t1 = truth1.set;
const t2new = new Set([...truth2.set].filter((op) => !t1.has(op)));
const controlAdded = observers.control?.addedAfterBack ?? new Set();
const count = (times, from, to = Infinity) => times.filter((t) => t >= from && t < to).length;
const result = {
  address: A,
  rpcUrl,
  phaseSeconds: PHASE_MS / 1000,
  marks: { restartAt: marks.restart, nodeBackAt: marks.nodeBack, nodeBack: back },
  groundTruth: {
    phase1: { first: truth1.first, second: truth1.second, stable: truth1.stable },
    rightAfterRestart: {
      size: truthBack.size,
      phase1Kept: [...t1].filter((op) => truthBack.has(op)).length,
      phase1Gone: [...t1].filter((op) => !truthBack.has(op)).length,
      appeared: [...truthBack].filter((op) => !t1.has(op)).length
    },
    phase2: { first: truth2.first, second: truth2.second, stable: truth2.stable, newSincePhase1: t2new.size },
    controlAddedAfterBack: controlAdded.size
  },
  observers: {},
  errors
};
for (const [name, o] of Object.entries(observers)) {
  const r = {
    notifications: {
      beforeRestart: count(o.notifications, 0, marks.restart),
      duringRestart: count(o.notifications, marks.restart, marks.nodeBack),
      afterBack: count(o.notifications, marks.nodeBack)
    },
    phase1Coverage: `${[...t1].filter((op) => o.addedBeforeRestart.has(op)).length}/${t1.size}`,
    afterBackCoverage: {
      ofControl: `${[...controlAdded].filter((op) => o.addedAfterBack.has(op)).length}/${controlAdded.size}`,
      ofNodeNew: `${[...t2new].filter((op) => o.addedAfterBack.has(op)).length}/${t2new.size}`
    },
    atSnapshot1: atSnapshot1[name] ?? undefined,
    atEnd: compare(truth2.set, name) ?? undefined
  };
  if (o.connects.length || o.disconnects.length) r.reconnect = { connects: o.connects, disconnects: o.disconnects };
  if (Object.keys(o.eventTypes).length) r.eventTypes = o.eventTypes;
  if (spies[name]) {
    const s = spies[name];
    r.transportSpy = {
      remoteSubscribeCalls: s.remoteSubscribeCalls,
      deliveries: { beforeRestart: count(s.deliveries, 0, marks.restart), afterBack: count(s.deliveries, marks.nodeBack) },
      phase1Coverage: `${[...t1].filter((op) => s.transportAdded.has(op)).length}/${t1.size}`,
      filter: s.filter
    };
  }
  if (kaspaRpcClients[name]) r.sessionConnectedAtEnd = kaspaRpcClients[name].session?.client?.isConnected ?? null;
  if (o.errors.length) r.errors = o.errors;
  result.observers[name] = r;
}
fs.writeFileSync(outFile, JSON.stringify(result, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
const rows = Object.entries(result.observers).map(([n, r]) => {
  const end = r.atEnd ? (r.atEnd.kind === "context" ? `end listed ${r.atEnd.mature + r.atEnd.pending}+stasis ${r.atEnd.stasisPerBalanceEvent} vs node ${r.atEnd.node} (not on node ${r.atEnd.listedNotOnNode})` : `end set ${r.atEnd.held} vs node ${r.atEnd.node} (missing ${r.atEnd.missing}, extra ${r.atEnd.extra})`) : "";
  return `${n.padEnd(19)} p1 ${r.phase1Coverage.padEnd(11)} afterBack ${r.afterBackCoverage.ofControl.padEnd(11)} notif ${r.notifications.beforeRestart}/${r.notifications.afterBack}  ${end}${r.errors ? "  errors " + r.errors.length : ""}`;
});
console.log(rows.join("\n"));
for (const c of closers) await Promise.resolve().then(c).catch(() => {});
stopMiner();
process.exit(0);
