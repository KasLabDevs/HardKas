// 3b implementation research: what does kaspa-wasm's UtxoProcessor emit when a UTXO of the
// tracked address is spent by a transaction this context did not create (with change back to
// the address)? Its event map has no "external". Records every processor event with the
// record's id, data type and entries, plus the context's listed set before and after.
// Keys in memory only. Assumes the canonical localnet is up. usage: node upstream-events-probe.mjs <repoRoot> <outFile>
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [repoArg, outArg] = process.argv.slice(2);
const repo = path.resolve(repoArg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const now = () => Date.now() - t0;
const req = createRequire(path.join(repo, "packages", "kaspa-rpc", "package.json"));
const ws = req("ws");
globalThis.WebSocket = ws.WebSocket ?? ws;
const core = await import(pathToFileURL(path.join(repo, "packages", "core", "dist", "index.js")).href);
const k = core.loadManagedKaspaWasmSync();
const rpcUrl = core.nodeRpcUrl();
const NODE = core.CANONICAL_LOCALNET.containerName;
const MINER = core.CANONICAL_LOCALNET.minerContainerName;
const key = () => new k.PrivateKey(crypto.randomBytes(32).toString("hex"));
const keyA = key();
const A = keyA.toAddress("simnet").toString();
const B = key().toAddress("simnet").toString();
const C = key().toAddress("simnet").toString();
const startMiner = (a) => { try { execSync(`docker rm -f ${MINER}`, { stdio: "ignore" }); } catch {} execSync(`docker run -d --name ${MINER} --network container:${NODE} ${core.CPUMINER_REFERENCE_IMAGE} -a ${a} -s 127.0.0.1 -p ${core.CANONICAL_LOCALNET.ports.rpc} --mine-when-not-synced -t 1 --throttle 5`, { stdio: "ignore" }); };
const stopMiner = () => { try { execSync(`docker rm -f ${MINER}`, { stdio: "ignore" }); } catch {} };
const opKey = (u) => `${u.outpoint.transactionId}:${u.outpoint.index}`;

const direct = new k.RpcClient({ url: rpcUrl, encoding: k.Encoding.SerdeJson, networkId: "simnet" });
await direct.connect({ blockAsyncConnect: true });
const virtualDaa = async () => BigInt((await direct.getBlockDagInfo()).virtualDaaScore);
const out = { A, events: [], phases: {} };
try {
  startMiner(A);
  await sleep(15000);
  stopMiner();
  await sleep(4000);
  const funded = (await direct.getUtxosByAddresses({ addresses: [A] })).entries;
  const maxDaa = funded.reduce((m, u) => (BigInt(u.blockDaaScore) > m ? BigInt(u.blockDaaScore) : m), 0n);
  const p = k.getNetworkParams("simnet");
  const need = maxDaa + BigInt(p.coinbaseTransactionMaturityPeriodDaa) + BigInt(p.coinbaseTransactionStasisPeriodDaa) + 50n;
  startMiner(C);
  while ((await virtualDaa()) < need) await sleep(2000);
  stopMiner();
  await sleep(5000);

  const rpc = new k.RpcClient({ url: rpcUrl, encoding: k.Encoding.SerdeJson, networkId: "simnet" });
  await rpc.connect({ blockAsyncConnect: true });
  const proc = new k.UtxoProcessor({ rpc, networkId: "simnet" });
  const ctx = new k.UtxoContext({ processor: proc });
  const listed = () => [...ctx.getMatureRange(0, ctx.matureLength), ...ctx.getPending()].map(opKey).sort();
  let phase = "start";
  proc.addEventListener((e) => {
    if (e.type === "daa-score-change") return;
    let rec = null;
    try { rec = typeof e.data?.serialize === "function" ? e.data.serialize() : null; } catch {}
    out.events.push({
      t: now(),
      phase,
      type: e.type,
      recordId: rec?.id ?? null,
      recordType: rec?.data?.type ?? null,
      entries: rec?.data?.data?.utxoEntries?.map((u) => `${u.index}:${u.amount}`) ?? null,
      balance: e.type === "balance" ? e.data?.balance ?? null : undefined,
      listedSize: ctx.matureLength + ctx.getPending().length
    });
  });
  await proc.start();
  await ctx.trackAddresses([A]);
  await sleep(3000);
  out.phases.before = listed();

  phase = "spend";
  const entries = (await direct.getUtxosByAddresses({ addresses: [A] })).entries.sort((x, y) => (opKey(x) < opKey(y) ? -1 : 1)).slice(0, 3);
  const total = entries.reduce((s, u) => s + BigInt(u.amount), 0n);
  const { transactions } = await k.createTransactions({ entries, outputs: [{ address: B, amount: total / 2n }], changeAddress: A, priorityFee: 0n, networkId: "simnet" });
  const ptx = transactions[0];
  ptx.sign([keyA]);
  const txid = await ptx.submit(direct);
  out.spend = { txid, inputs: ptx.transaction.inputs.map((i) => `${i.previousOutpoint.transactionId}:${i.previousOutpoint.index}`) };
  startMiner(C);
  await sleep(12000);
  stopMiner();
  await sleep(5000);
  out.phases.after = listed();
  out.phases.removed = out.phases.before.filter((x) => !out.phases.after.includes(x));
  out.phases.added = out.phases.after.filter((x) => !out.phases.before.includes(x));
  await proc.stop();
  await rpc.disconnect();
} catch (e) {
  out.fatal = String(e?.stack ?? e).slice(0, 500);
} finally {
  stopMiner();
  await direct.disconnect().catch(() => {});
  fs.writeFileSync(path.resolve(outArg), JSON.stringify(out, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  process.exit(0);
}
