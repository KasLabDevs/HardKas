// 3b gap experiment · the RECORD run (design: 3b-GAP-EXPERIMENT-DESIGN.md, criterion approved 29-sep).
// DO NOT RUN until the owner confirms nobody else is using the canonical localnet and the tree is
// quiet. Assumes the canonical localnet is up. Read-only for the repository: built dist + kaspa-wasm.
// Question: if the node changes while a client is disconnected, does resubscribing alone rebuild the
// lost state (R), or does it take UtxoContext's clear() → trackAddresses() re-snapshot (U)?
// Keys live in memory only and are never printed or written (AUD-21).
// usage: node gap-experiment.mjs <repoRoot> <outFile>
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createPartitionProxy, entryMap, applyNotification, diffSets, isExact, decide, opOf } from "./gap-lib.mjs";

const [repoArg, outArg] = process.argv.slice(2);
const repo = path.resolve(repoArg);
const outFile = path.resolve(outArg);
const FUND_MS = 20000;
const DEPTH_MS = 10000;
const DAA_MARGIN = 50n;
const MATURATION_MAX_MS = 10 * 60 * 1000;
const t0 = Date.now();
const now = () => Date.now() - t0;
const log = (...a) => console.log(`[${(now() / 1000).toFixed(1)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const msg = (e) => String(e?.message ?? e).slice(0, 300);
const errors = [];
process.on("uncaughtException", (e) => errors.push({ at: now(), where: "uncaughtException", error: msg(e?.stack ?? e) }));
process.on("unhandledRejection", (e) => errors.push({ at: now(), where: "unhandledRejection", error: msg(e?.stack ?? e) }));

// kaspa-wasm needs a WebSocket in Node; kaspa-rpc ships `ws` for it (Windows exit abort otherwise).
const req = createRequire(path.join(repo, "packages", "kaspa-rpc", "package.json"));
const ws = req("ws");
globalThis.WebSocket = ws.WebSocket ?? ws;
const dist = (pkg) => pathToFileURL(path.join(repo, "packages", pkg, "dist", "index.js")).href;
const core = await import(dist("core"));
const { JsonWrpcKaspaClient } = await import(dist("kaspa-rpc"));
const k = core.loadManagedKaspaWasmSync();
const rpcUrl = core.nodeRpcUrl();
const target = new URL(rpcUrl);
const NODE = core.CANONICAL_LOCALNET.containerName;
const MINER = core.CANONICAL_LOCALNET.minerContainerName;

const newKey = () => new k.PrivateKey(crypto.randomBytes(32).toString("hex"));
const keyA = newKey();
const A = keyA.toAddress("simnet").toString();
const B = newKey().toAddress("simnet").toString();
const C = newKey().toAddress("simnet").toString();
const spkA = k.payToAddressScript(A).script;

// ---- node helpers -------------------------------------------------------------------------------------
// The canonical companion miner's arguments (cli localnet-runners.ts toccataMinerArgs, throttle 5 ms).
function startMiner(address) {
  try { execSync(`docker rm -f ${MINER}`, { stdio: "ignore" }); } catch {}
  execSync(`docker run -d --name ${MINER} --network container:${NODE} ${core.CPUMINER_REFERENCE_IMAGE} -a ${address} -s 127.0.0.1 -p ${core.CANONICAL_LOCALNET.ports.rpc} --mine-when-not-synced -t 1 --throttle 5`, { stdio: "ignore" });
}
function stopMiner() {
  try { execSync(`docker rm -f ${MINER}`, { stdio: "ignore" }); } catch {}
}
async function withDirect(fn) {
  const c = new k.RpcClient({ url: rpcUrl, encoding: k.Encoding.SerdeJson, networkId: "simnet" });
  try {
    await c.connect({ blockAsyncConnect: true, strategy: "fallback", timeoutDuration: 15000 });
    return await fn(c);
  } finally {
    await c.disconnect().catch(() => {});
  }
}
const truthEntries = () => withDirect(async (c) => (await c.getUtxosByAddresses({ addresses: [A] }))?.entries ?? []);
const truth = async () => entryMap(await truthEntries());
const virtualDaa = () => withDirect(async (c) => BigInt((await c.getBlockDagInfo()).virtualDaaScore));
const sameMap = (a, b) => a.size === b.size && [...a].every(([op, amount]) => b.get(op) === amount);
const quietReads = [];
async function quiet(label, maxMs = 120000) {
  const started = now();
  let prev = await truth();
  const reads = [prev.size];
  while (now() - started < maxMs) {
    await sleep(3000);
    const next = await truth();
    reads.push(next.size);
    if (sameMap(prev, next)) {
      quietReads.push({ label, stable: true, reads });
      log(`${label}: ${next.size} UTXOs, quiet (reads ${reads.join(" → ")})`);
      return next;
    }
    prev = next;
  }
  quietReads.push({ label, stable: false, reads });
  log(`${label}: NOT quiet after ${maxMs / 1000} s (reads ${reads.join(" → ")})`);
  return prev;
}

// ---- candidates -----------------------------------------------------------------------------------------
const cands = {};
const closers = [];
const cand = (name, kind) => (cands[name] ??= { kind, set: new Map(), connects: [], disconnects: [], resubscribed: [], reRegistrations: [], errors: [], notifications: 0, balance: null });

/** L (direct, live control) and R (proxied, resubscribe-only): snapshot at start, then notifications, removed first. */
async function snapshotSubscriber(name, url, resubscribe) {
  const o = cand(name, resubscribe ? "RpcClient: snapshot at start, resubscribe only on reconnect" : "RpcClient: live control, never cut");
  const rpc = new k.RpcClient({ url, encoding: k.Encoding.SerdeJson, networkId: "simnet" });
  let ready = false;
  const buffer = [];
  rpc.addEventListener("connect", () => {
    o.connects.push(now());
    if (ready && resubscribe) rpc.subscribeUtxosChanged([A]).then(() => o.resubscribed.push(now()), (e) => o.errors.push(`resubscribe: ${msg(e)}`));
  });
  rpc.addEventListener("disconnect", () => o.disconnects.push(now()));
  rpc.addEventListener("utxos-changed", (e) => {
    const n = { removed: entryMap(e?.data?.removed), added: entryMap(e?.data?.added) };
    o.notifications++;
    if (ready) applyNotification(o.set, n.removed, n.added);
    else buffer.push(n);
  });
  await rpc.connect({ blockAsyncConnect: true });
  await rpc.subscribeUtxosChanged([A]);
  o.set = entryMap((await rpc.getUtxosByAddresses({ addresses: [A] }))?.entries);
  for (const n of buffer) applyNotification(o.set, n.removed, n.added);
  ready = true;
  closers.push(() => rpc.disconnect());
}

/** U (proxied, the upstream rule) and U0 (proxied, no rule): UtxoProcessor + UtxoContext. */
async function contextObserver(name, url, rule) {
  const o = cand(name, rule ? "UtxoContext: clear() → trackAddresses() on every later connect" : "UtxoContext: no re-registration (negative control)");
  const rpc = new k.RpcClient({ url, encoding: k.Encoding.SerdeJson, networkId: "simnet" });
  await rpc.connect({ blockAsyncConnect: true });
  const proc = new k.UtxoProcessor({ rpc, networkId: "simnet" });
  const ctx = new k.UtxoContext({ processor: proc });
  let ready = false;
  proc.addEventListener(async (e) => {
    if (e.type === "balance") o.balance = e.data?.balance ?? null;
    else if (e.type === "connect") o.connects.push(now());
    else if (e.type === "disconnect") o.disconnects.push(now());
    if (e.type === "connect" && ready && rule) {
      const start = now();
      try {
        await ctx.clear();
        await ctx.trackAddresses([A]);
        o.reRegistrations.push({ start, done: now() });
      } catch (err) {
        o.errors.push(`re-register: ${msg(err)}`);
      }
    }
  });
  await proc.start();
  await ctx.trackAddresses([A]);
  ready = true;
  o.context = ctx;
  closers.push(async () => { await proc.stop(); await rpc.disconnect(); });
}
const contextSet = (o) => entryMap([...o.context.getMatureRange(0, o.context.matureLength), ...o.context.getPending()]);

/** K (proxied, optional): HardKAS kaspa-rpc as it is today, with a call every 2 s driving its lazy restore. */
async function kaspaRpcObserver(name, url) {
  const o = cand(name, "kaspa-rpc JsonWrpcKaspaClient: snapshot at start, lazy onConnect restore (call every 2 s)");
  const c = new JsonWrpcKaspaClient({ rpcUrl: url, timeoutMs: 5000 });
  let ready = false;
  const buffer = [];
  await c.subscribeToUtxosChanged([A], (ev) => {
    const n = { removed: entryMap(ev?.removed), added: entryMap(ev?.added) };
    o.notifications++;
    if (ready) applyNotification(o.set, n.removed, n.added);
    else buffer.push(n);
  });
  const snap = await c.call("getUtxosByAddresses", { addresses: [A] });
  o.set = entryMap(snap?.entries ?? snap);
  for (const n of buffer) applyNotification(o.set, n.removed, n.added);
  ready = true;
  const timer = setInterval(() => { c.call("getBlockDagInfo", {}).then(() => { o.lastTrafficOk = now(); }, () => {}); }, 2000);
  closers.push(() => { clearInterval(timer); return c.close?.(); });
}

function setOf(o) {
  return o.context ? contextSet(o) : o.set;
}
// Full snapshots (reviewer, 29-sep): the complete truth and every candidate's complete set at each
// checkpoint, written to <outFile>.snapshots.json, so the verdict can be checked without decide().
const snapshots = {};
const sortedEntries = (m) => [...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
function snapshot(label, truthSet) {
  snapshots[label] = { at: now(), truth: sortedEntries(truthSet), candidates: Object.fromEntries(Object.entries(cands).map(([n, o]) => [n, sortedEntries(setOf(o))])) };
}
function compareAll(truthSet) {
  const out = {};
  for (const [name, o] of Object.entries(cands)) {
    const d = diffSets(setOf(o), truthSet);
    out[name] = { ...d, exact: isExact(d), stasis: o.balance?.stasisUtxoCount ?? null, pending: o.balance?.pendingUtxoCount ?? null };
  }
  return out;
}

// ---- the known change: a spend from A to B with change back to A ----------------------------------------
const MATURITY = typeof core.getCoinbaseMaturity === "function" ? BigInt(core.getCoinbaseMaturity("simnet")) : 1000n;
async function spend(label, eligible) {
  const entries = await truthEntries();
  const virt = await virtualDaa();
  const pick = entries
    .filter((u) => eligible(opOf(u.outpoint.transactionId, u.outpoint.index)) && BigInt(u.blockDaaScore) + MATURITY + DAA_MARGIN < virt)
    .sort((x, y) => (opOf(x.outpoint.transactionId, x.outpoint.index) < opOf(y.outpoint.transactionId, y.outpoint.index) ? -1 : 1))
    .slice(0, 3);
  if (pick.length < 3) throw new Error(`${label}: only ${pick.length} inputs mature by consensus`);
  const total = pick.reduce((s, u) => s + BigInt(u.amount), 0n);
  const { transactions } = await k.createTransactions({ entries: pick, outputs: [{ address: B, amount: total / 2n }], changeAddress: A, priorityFee: 0n, networkId: "simnet" });
  if (transactions.length !== 1) throw new Error(`${label}: the generator produced ${transactions.length} transactions`);
  const ptx = transactions[0];
  ptx.sign([keyA]);
  const txid = await withDirect((c) => ptx.submit(c));
  const tx = ptx.transaction;
  // The known delta comes from the transaction itself: what it spends of A, and what it pays back to A.
  const inputs = tx.inputs.map((i) => opOf(i.previousOutpoint.transactionId, i.previousOutpoint.index)).sort();
  const change = tx.outputs.map((out, idx) => (out.scriptPublicKey.script === spkA ? opOf(txid, idx) : null)).filter(Boolean).sort();
  log(`${label}: submitted ${txid.slice(0, 16)}… spending ${inputs.length} of A's UTXOs, ${change.length} change output(s) to A`);
  return { label, txid, inputs, change, paidToB: String(total / 2n), submittedAt: now() };
}
async function mineUntilAccepted(s, maxMs = 120000) {
  startMiner(C);
  const end = Date.now() + maxMs;
  let acceptedAt = null;
  try {
    while (Date.now() < end) {
      const t = await truth();
      if (s.inputs.every((op) => !t.has(op)) && s.change.every((op) => t.has(op))) {
        acceptedAt = now();
        break;
      }
      await sleep(1000);
    }
    if (acceptedAt !== null) await sleep(DEPTH_MS);
  } finally {
    stopMiner();
  }
  return acceptedAt;
}

// ---- the run --------------------------------------------------------------------------------------------
const result = { addresses: { A, B, C }, rpcUrl, maturityUsed: String(MATURITY), params: null, timeline: {}, spends: {}, checkpoints: {}, validity: {}, proxy: null, candidates: {}, verdict: null, errors };
const proxy = createPartitionProxy({ host: target.hostname, port: Number(target.port) });
try {
  await virtualDaa(); // precondition: the node answers
  result.params = k.getNetworkParams("simnet");

  // 1. funding, 2. maturation (mine to C until every UTXO of A is past stasis and maturity, both views)
  startMiner(A);
  log("funding: mining to A");
  await sleep(FUND_MS);
  stopMiner();
  await quiet("funded");
  const funded = await truthEntries();
  const maxDaa = funded.reduce((m, u) => (BigInt(u.blockDaaScore) > m ? BigInt(u.blockDaaScore) : m), 0n);
  const walletNeed = BigInt(result.params.coinbaseTransactionMaturityPeriodDaa) + BigInt(result.params.coinbaseTransactionStasisPeriodDaa);
  const needDaa = maxDaa + (walletNeed > MATURITY ? walletNeed : MATURITY) + DAA_MARGIN;
  result.timeline.maturation = { maxFundingDaa: String(maxDaa), needDaa: String(needDaa) };
  startMiner(C);
  log(`maturation: mining to C until virtual DAA ≥ ${needDaa}`);
  const matEnd = Date.now() + MATURATION_MAX_MS;
  try {
    while ((await virtualDaa()) < needDaa) {
      if (Date.now() > matEnd) throw new Error("maturation did not reach the DAA target in time");
      await sleep(2000);
    }
  } finally {
    stopMiner();
  }
  const T0 = await quiet("T0");

  // 3. candidates, then C0: the same initial state everywhere
  await proxy.listen();
  await snapshotSubscriber("L", rpcUrl, false);
  await snapshotSubscriber("R", proxy.url, true);
  await contextObserver("U", proxy.url, true);
  await kaspaRpcObserver("K", proxy.url);
  await contextObserver("U0", proxy.url, false);
  // The decision rests on L, R and U; K and U0 are recorded for information only.
  const DECIDING = ["L", "R", "U"];
  const c0End = Date.now() + 60000;
  while (Date.now() < c0End) {
    const all = compareAll(T0);
    if (DECIDING.every((n) => all[n]?.exact) && cands.U.balance && cands.U.balance.stasisUtxoCount === 0 && cands.U.balance.pendingUtxoCount === 0) break;
    await sleep(1000);
  }
  result.checkpoints.C0 = compareAll(T0);
  snapshot("before-gap", T0);
  result.timeline.c0 = now();

  // 4. partition
  const partitionAt = now();
  await proxy.partition();
  const acceptedBeforeGap = proxy.counters.accepted;
  let maxActiveInGap = 0;
  const sampler = setInterval(() => { maxActiveInGap = Math.max(maxActiveInGap, proxy.active()); }, 250);
  await sleep(3000);
  log(`partition: R ${cands.R.disconnects.filter((t) => t >= partitionAt).length} disconnect(s), U ${cands.U.disconnects.filter((t) => t >= partitionAt).length}`);

  // 5. the gap change, only while cut off
  const gapSpend = await spend("gap", (op) => T0.has(op));
  result.spends.gap = gapSpend;
  gapSpend.acceptedAt = await mineUntilAccepted(gapSpend);
  const Tgap = await quiet("T_gap");
  result.checkpoints.gapEnd = compareAll(Tgap);
  snapshot("during-gap", Tgap);
  clearInterval(sampler);
  const acceptedDuringGap = proxy.counters.accepted - acceptedBeforeGap;

  // 6. heal, wait for R to resubscribe and U to re-register, then C2
  const healAt = now();
  await proxy.heal();
  const healEnd = Date.now() + 60000;
  while (Date.now() < healEnd) {
    const rBack = cands.R.resubscribed.some((t) => t >= healAt);
    const uBack = cands.U.reRegistrations.some((r) => r.start >= healAt);
    if (rBack && uBack) break;
    await sleep(500);
  }
  await sleep(5000);
  const T2 = await quiet("C2");
  result.checkpoints.C2 = compareAll(T2);
  snapshot("after-reconnect", T2);

  // 7. post-heal live change: only original funding UTXOs, never the gap's change
  const postSpend = await spend("post", (op) => T0.has(op) && !gapSpend.inputs.includes(op));
  result.spends.post = postSpend;
  postSpend.acceptedAt = await mineUntilAccepted(postSpend);
  const T3 = await quiet("C3");
  result.checkpoints.C3 = compareAll(T3);
  snapshot("after-control-spend", T3);
  result.timeline = { ...result.timeline, partitionAt, healAt };

  // validity (design §6)
  const expectedGap = new Map(T0);
  for (const op of gapSpend.inputs) expectedGap.delete(op);
  const tgapOps = [...Tgap.keys()].sort();
  const expGapOps = [...expectedGap.keys()].filter((op) => !gapSpend.change.includes(op)).concat(gapSpend.change).sort();
  const expectedFinalChange = postSpend.change;
  // The expected outpoints, written next to the snapshots so the verdict can be checked by hand.
  result.expected = {
    gapInputs: gapSpend.inputs,
    gapChange: gapSpend.change,
    tGapOutpoints: expGapOps,
    postInputs: postSpend.inputs,
    postChange: postSpend.change
  };
  const R = cands.R;
  const U = cands.U;
  result.validity = {
    V1: { ok: DECIDING.every((n) => result.checkpoints.C0[n]?.exact) && U.balance?.stasisUtxoCount === 0 && U.balance?.pendingUtxoCount === 0, why: "L, R and U equal T0 and U lists everything (stasis 0, pending 0)" },
    V2: { ok: maxActiveInGap === 0 && acceptedDuringGap === 0 && R.disconnects.some((t) => t >= partitionAt) && U.disconnects.some((t) => t >= partitionAt) && !R.connects.some((t) => t >= partitionAt && t < healAt), why: `no proxied socket during the gap (max ${maxActiveInGap}, accepted ${acceptedDuringGap}), R and U disconnected and did not reconnect before the heal` },
    V3: { ok: gapSpend.acceptedAt !== null && JSON.stringify(tgapOps) === JSON.stringify(expGapOps) && [...T0].every(([op, amt]) => !Tgap.has(op) || Tgap.get(op) === amt), why: "the node changed exactly by the gap spend (T_gap = T0 − inputs + change)" },
    V4: { ok: result.checkpoints.gapEnd.L?.exact === true && result.checkpoints.C3.L?.exact === true, why: "the live control saw the gap and the post-heal spend" },
    V5: { ok: quietReads.every((q) => q.stable), why: "the node was quiet at every checkpoint" },
    V6: { ok: R.resubscribed.some((t) => t >= healAt) && U.reRegistrations.some((r) => r.start >= healAt), why: "R resubscribed and U re-registered after the heal" },
    V7: { ok: postSpend.acceptedAt !== null && postSpend.inputs.every((op) => !R.set.has(op)) && expectedFinalChange.every((op) => R.set.has(op)), why: "R applied the post-heal spend live" }
  };
  result.verdict = decide({
    validity: result.validity,
    gap: { inputs: gapSpend.inputs, change: gapSpend.change },
    R: { C2: result.checkpoints.C2.R, C3: result.checkpoints.C3.R },
    U: { C2: result.checkpoints.C2.U, C3: result.checkpoints.C3.U }
  });
} catch (e) {
  result.fatal = msg(e?.stack ?? e);
  result.verdict = { verdict: "INVALID", reasons: [`harness: ${msg(e)}`] };
} finally {
  stopMiner();
  result.proxy = { ...proxy.counters };
  for (const [name, o] of Object.entries(cands)) {
    result.candidates[name] = { kind: o.kind, connects: o.connects, disconnects: o.disconnects, resubscribed: o.resubscribed, reRegistrations: o.reRegistrations, notifications: o.notifications, errors: o.errors, lastTrafficOk: o.lastTrafficOk ?? null };
  }
  for (const c of closers) await Promise.resolve().then(c).catch(() => {});
  await proxy.partition().catch(() => {});
  fs.writeFileSync(outFile, JSON.stringify(result, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  fs.writeFileSync(
    outFile.replace(/\.json$/, "") + ".snapshots.json",
    JSON.stringify({ expected: result.expected ?? null, spends: result.spends, snapshots }, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );
  log(`verdict: ${result.verdict?.verdict} — ${(result.verdict?.reasons ?? []).join("; ")}`);
  process.exit(0);
}
