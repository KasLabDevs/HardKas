// Harness check for events-diff run 3: every subscription observer's reconstructed set
// (added − removed) came out empty although the node held 1313/2564 UTXOs. What does
// `removed` carry? Raw kaspa-wasm RpcClient only; canonical throttled miner.
// usage: node removed-probe.mjs <repoRoot> [seconds]
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repo = path.resolve(process.argv[2]);
const SECONDS = Number(process.argv[3] ?? 10);
const req = createRequire(path.join(repo, "packages", "kaspa-rpc", "package.json"));
const ws = req("ws");
globalThis.WebSocket = ws.WebSocket ?? ws;
const core = await import(pathToFileURL(path.join(repo, "packages", "core", "dist", "index.js")).href);
const k = core.loadManagedKaspaWasmSync();
const rpcUrl = core.nodeRpcUrl();
const NODE = core.CANONICAL_LOCALNET.containerName;
const MINER = core.CANONICAL_LOCALNET.minerContainerName;
const A = new k.PrivateKey(crypto.randomBytes(32).toString("hex")).toAddress("simnet").toString();

const ops = (list) => (Array.isArray(list) ? list : []).map((u) => `${u.outpoint.transactionId}:${u.outpoint.index}`);
const addrOf = (u) => { try { return u.address?.toString(); } catch { return "?"; } };
const stats = { notifications: 0, sameArrayObject: 0, addedTotal: 0, removedTotal: 0, removedAlsoAddedInSameNotification: 0, removedNeverSeenAdded: 0, removedSeenAddedEarlier: 0, removedAddressIsA: 0, removedAddressOther: 0, addedAddressOther: 0 };
const everAdded = new Set();
const set = new Set();
let sample = null;

const rpc = new k.RpcClient({ url: rpcUrl, encoding: k.Encoding.SerdeJson, networkId: "simnet" });
rpc.addEventListener("utxos-changed", (e) => {
  stats.notifications++;
  const d = e?.data;
  if (d?.added === d?.removed) stats.sameArrayObject++;
  const a = ops(d?.added), r = ops(d?.removed);
  stats.addedTotal += a.length;
  stats.removedTotal += r.length;
  const aSet = new Set(a);
  for (const u of d?.added ?? []) if (addrOf(u) !== A) stats.addedAddressOther++;
  for (const u of d?.removed ?? []) (addrOf(u) === A ? stats.removedAddressIsA++ : stats.removedAddressOther++);
  for (const op of r) {
    if (aSet.has(op)) stats.removedAlsoAddedInSameNotification++;
    else if (everAdded.has(op)) stats.removedSeenAddedEarlier++;
    else stats.removedNeverSeenAdded++;
  }
  if (!sample && r.length) sample = { addedLen: a.length, removedLen: r.length, firstAdded: a[0], firstRemoved: r[0], removedEqualsAdded: a.length === r.length && a.every((op, i) => op === r[i]) };
  for (const op of a) { everAdded.add(op); set.add(op); }
  for (const op of r) set.delete(op);
});
await rpc.connect({ blockAsyncConnect: true });
await rpc.subscribeUtxosChanged([A]);

try { execSync(`docker rm -f ${MINER}`, { stdio: "ignore" }); } catch {}
execSync(`docker run -d --name ${MINER} --network container:${NODE} ${core.CPUMINER_REFERENCE_IMAGE} -a ${A} -s 127.0.0.1 -p ${core.CANONICAL_LOCALNET.ports.rpc} --mine-when-not-synced -t 1 --throttle 5`, { stdio: "ignore" });
await new Promise((r) => setTimeout(r, SECONDS * 1000));
try { execSync(`docker rm -f ${MINER}`, { stdio: "ignore" }); } catch {}
await new Promise((r) => setTimeout(r, 5000));
const node = new Set(ops((await rpc.getUtxosByAddresses({ addresses: [A] }))?.entries));
console.log(JSON.stringify({
  stats,
  sample,
  node: node.size,
  reconstructed: set.size,
  everAdded: everAdded.size,
  nodeNotEverAdded: [...node].filter((op) => !everAdded.has(op)).length,
  nodeInReconstructed: [...node].filter((op) => set.has(op)).length
}, null, 2));
await rpc.disconnect();
process.exit(0);
