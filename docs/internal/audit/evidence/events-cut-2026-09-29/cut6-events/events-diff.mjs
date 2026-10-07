// Surface Cut item 3 · events / UtxoContext — live substitution differential.
// Read-only for the repository: it imports the built packages and talks to the
// canonical localnet. Same node, same fresh address A, seven observers:
//   hkEventsAsWired     SDK `hardkas.events` exactly as the SDK wires it (no connect())
//   hkEventsConnected   SDK `hardkas.events` after `events.connect()`
//   toolkitWatch        @hardkas/toolkit WalletSubscriptionManager.watch
//   kaspaRpc            @hardkas/kaspa-rpc JsonWrpcKaspaClient.subscribeToUtxosChanged
//   utxoContext         kaspa-wasm UtxoProcessor + UtxoContext, documented reconnect
//                       handling (clear() + trackAddresses() on every later "connect")
//   utxoContextNoReReg  the same without that re-registration
//   rawRpc              kaspa-wasm RpcClient.subscribeUtxosChanged, never resubscribed
// Phase 1: the pinned CPU miner mines to A. Phase 2: the node container is restarted,
// the miner restarted. Ground truth after each phase: getUtxosByAddresses([A]).
// usage: node events-diff.mjs <repoRoot> <projectDir> <outFile> [phaseSeconds]
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
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const errors = [];
process.on("uncaughtException", (e) => errors.push({ where: "uncaughtException", error: String(e?.stack ?? e).slice(0, 400) }));
process.on("unhandledRejection", (e) => errors.push({ where: "unhandledRejection", error: String(e?.stack ?? e).slice(0, 400) }));

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

/** Every outpoint in a notification, whatever its shape: {transactionId|txId, index}, outpoint objects, or wallet transaction records ({id, …utxoEntries[{index}]}). */
function findOutpoints(x, out = new Set(), recordId) {
  if (!x || typeof x !== "object") return out;
  if (Array.isArray(x)) {
    for (const v of x) findOutpoints(v, out, recordId);
    return out;
  }
  const txid = x.transactionId ?? x.txId ?? x.txid ?? x.transaction_id;
  if (typeof txid === "string" && /^[0-9a-f]{64}$/i.test(txid) && Number.isInteger(Number(x.index))) out.add(`${txid.toLowerCase()}:${Number(x.index)}`);
  const id = typeof x.id === "string" && /^[0-9a-f]{64}$/i.test(x.id) ? x.id.toLowerCase() : recordId;
  if (Array.isArray(x.utxoEntries) && id) {
    for (const u of x.utxoEntries) if (Number.isInteger(Number(u?.index))) out.add(`${id}:${Number(u.index)}`);
  }
  for (const [key, v] of Object.entries(x)) if (key !== "utxoEntries") findOutpoints(v, out, id);
  return out;
}

let phase = 0;
const observers = {};
function observer(name) {
  observers[name] ??= { outpoints: new Map(), notifications: [0, 0, 0], eventTypes: {}, errors: [] };
  return observers[name];
}
function record(name, outpoints) {
  const o = observer(name);
  o.notifications[phase]++;
  for (const op of outpoints) if (!o.outpoints.has(op)) o.outpoints.set(op, phase);
}
async function guarded(name, fn) {
  try {
    await fn();
  } catch (e) {
    observer(name).errors.push(String(e?.message ?? e).slice(0, 300));
    log(`${name}: setup error`, String(e?.message ?? e).slice(0, 200));
  }
}

function docker(cmd, ignore = true) {
  return execSync(`docker ${cmd}`, { stdio: ignore ? "ignore" : "pipe", encoding: "utf8" });
}
const startMiner = () => {
  try { docker(`rm -f ${MINER}`); } catch {}
  docker(`run -d --name ${MINER} --network=container:${NODE} ${core.CPUMINER_REFERENCE_IMAGE} --mining-address ${A} --kaspad-address 127.0.0.1 --port ${core.CANONICAL_LOCALNET.ports.rpc} --threads 1 --mine-when-not-synced`);
};
const stopMiner = () => { try { docker(`rm -f ${MINER}`); } catch {} };

async function groundTruth() {
  const c = new JsonWrpcKaspaClient({ rpcUrl, timeoutMs: 15000 });
  try {
    return findOutpoints(await c.call("getUtxosByAddresses", { addresses: [A] }));
  } finally {
    await c.close?.().catch?.(() => {});
  }
}
async function waitNode(timeoutMs = 120000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const c = new JsonWrpcKaspaClient({ rpcUrl, timeoutMs: 3000 });
    try {
      await c.call("getBlockDagInfo", {});
      return true;
    } catch {
      await sleep(1000);
    } finally {
      await c.close?.().catch?.(() => {});
    }
  }
  return false;
}

// ---- observers ------------------------------------------------------------
const closers = [];
const hkAsWired = await sdk.Hardkas.open(projectDir);
const hkConnected = await sdk.Hardkas.open(projectDir);
await guarded("hkEventsAsWired", async () => {
  observer("hkEventsAsWired");
  await hkAsWired.events.subscribe({ type: "utxosChanged", addresses: [A] }, (env) => record("hkEventsAsWired", findOutpoints(env?.payload)));
});
await guarded("hkEventsConnected", async () => {
  observer("hkEventsConnected");
  await hkConnected.events.connect();
  await hkConnected.events.subscribe({ type: "utxosChanged", addresses: [A] }, (env) => record("hkEventsConnected", findOutpoints(env?.payload)));
});
await guarded("toolkitWatch", async () => {
  observer("toolkitWatch");
  const c = new JsonWrpcKaspaClient({ rpcUrl });
  closers.push(() => c.close?.());
  const tk = new WalletSubscriptionManager(c, async () => A);
  await tk.watch((ev) => record("toolkitWatch", findOutpoints(ev?.details)));
});
await guarded("kaspaRpc", async () => {
  observer("kaspaRpc");
  const c = new JsonWrpcKaspaClient({ rpcUrl });
  closers.push(() => c.close?.());
  await c.subscribeToUtxosChanged([A], (ev) => record("kaspaRpc", findOutpoints(ev?.added)));
});
async function utxoContext(name, reRegister) {
  observer(name);
  const rpc = new k.RpcClient({ url: rpcUrl, encoding: k.Encoding.SerdeJson, networkId: "simnet" });
  await rpc.connect({ blockAsyncConnect: true });
  const proc = new k.UtxoProcessor({ rpc, networkId: "simnet" });
  const ctx = new k.UtxoContext({ processor: proc });
  let ready = false;
  proc.addEventListener(async (e) => {
    const o = observer(name);
    o.eventTypes[e.type] = (o.eventTypes[e.type] ?? 0) + 1;
    if (["pending", "stasis", "maturity", "discovery"].includes(e.type)) record(name, findOutpoints(e.data));
    if (e.type === "connect" && ready && reRegister) {
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
  ready = true;
  closers.push(async () => { await proc.stop(); await rpc.disconnect(); });
  return ctx;
}
const contexts = {};
await guarded("utxoContext", async () => { contexts.utxoContext = await utxoContext("utxoContext", true); });
await guarded("utxoContextNoReReg", async () => { contexts.utxoContextNoReReg = await utxoContext("utxoContextNoReReg", false); });
await guarded("rawRpc", async () => {
  observer("rawRpc");
  const rpc = new k.RpcClient({ url: rpcUrl, encoding: k.Encoding.SerdeJson, networkId: "simnet" });
  await rpc.connect({ blockAsyncConnect: true });
  rpc.addEventListener("utxos-changed", (e) => record("rawRpc", findOutpoints(e?.data?.added ?? e?.data)));
  await rpc.subscribeUtxosChanged([A]);
  closers.push(() => rpc.disconnect());
});
log(`observers ready for ${A.slice(0, 20)}…`);

// ---- phase 1: mine to A ------------------------------------------------------
phase = 1;
startMiner();
log("phase 1: mining");
await sleep(PHASE_MS);
stopMiner();
await sleep(5000);
const truth1 = await groundTruth();
log(`phase 1 ground truth: ${truth1.size} UTXOs`);

// ---- phase 2: node restart, then mine again -----------------------------------
phase = 2;
log("phase 2: restarting the node");
docker(`restart ${NODE}`);
const back = await waitNode();
log(`node back: ${back}`);
await sleep(8000); // let every client's reconnect strategy fire
startMiner();
log("phase 2: mining");
await sleep(PHASE_MS);
stopMiner();
await sleep(5000);
const truth2 = await groundTruth();
log(`phase 2 ground truth: ${truth2.size} UTXOs`);

// ---- result ------------------------------------------------------------------------
const t1 = [...truth1];
const t2new = [...truth2].filter((op) => !truth1.has(op));
const result = {
  address: A,
  rpcUrl,
  phaseSeconds: PHASE_MS / 1000,
  nodeBackAfterRestart: back,
  groundTruth: { phase1: t1.length, phase2New: t2new.length, final: truth2.size },
  observers: {},
  errors
};
for (const [name, o] of Object.entries(observers)) {
  const p1 = new Set([...o.outpoints].filter(([, p]) => p === 1).map(([op]) => op));
  const p2 = new Set([...o.outpoints].filter(([, p]) => p === 2).map(([op]) => op));
  result.observers[name] = {
    phase1: { seen: t1.filter((op) => p1.has(op)).length, of: t1.length, notifications: o.notifications[1] },
    phase2: { seen: t2new.filter((op) => p2.has(op)).length, of: t2new.length, notifications: o.notifications[2] },
    notInGroundTruth: [...o.outpoints.keys()].filter((op) => !truth2.has(op) && !truth1.has(op)).length,
    eventTypes: Object.keys(o.eventTypes).length ? o.eventTypes : undefined,
    errors: o.errors.length ? o.errors : undefined
  };
}
for (const [name, ctx] of Object.entries(contexts)) {
  try {
    const held = new Set([...findOutpoints(ctx.getPending()), ...findOutpoints(ctx.getMatureRange(0, ctx.matureLength))]);
    result.observers[name].contextHoldsFinal = [...truth2].filter((op) => held.has(op)).length;
  } catch (e) {
    result.observers[name].contextHoldsFinal = `error: ${String(e?.message ?? e).slice(0, 120)}`;
  }
}
fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
const table = Object.entries(result.observers).map(([n, r]) => `${n.padEnd(20)} phase1 ${r.phase1.seen}/${r.phase1.of}  phase2 ${r.phase2.seen}/${r.phase2.of}${r.errors ? "  errors: " + r.errors.length : ""}`);
console.log(table.join("\n"));
for (const c of closers) await Promise.resolve().then(c).catch(() => {});
stopMiner();
process.exit(0);
