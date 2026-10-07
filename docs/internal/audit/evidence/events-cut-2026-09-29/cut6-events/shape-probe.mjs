// Harness check for events-diff run 1: what do the upstream payloads look like at
// runtime? Mines a few seconds to a fresh address and prints the key structure of
// one sample of each payload. Addresses/txids only; the key never leaves memory.
// usage: node shape-probe.mjs <repoRoot> [seconds]
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repo = path.resolve(process.argv[2]);
const SECONDS = Number(process.argv[3] ?? 6);
const req = createRequire(path.join(repo, "packages", "kaspa-rpc", "package.json"));
const ws = req("ws");
globalThis.WebSocket = ws.WebSocket ?? ws;
const core = await import(pathToFileURL(path.join(repo, "packages", "core", "dist", "index.js")).href);
const k = core.loadManagedKaspaWasmSync();
const rpcUrl = core.nodeRpcUrl();
const NODE = core.CANONICAL_LOCALNET.containerName;
const MINER = core.CANONICAL_LOCALNET.minerContainerName;
const A = new k.PrivateKey(crypto.randomBytes(32).toString("hex")).toAddress("simnet").toString();

/** Key structure: plain values → type name; class instances → "Class{...}" of their toJSON(). */
function shape(x, depth = 0) {
  if (x === null || x === undefined) return String(x);
  if (typeof x !== "object") return typeof x === "string" && /^[0-9a-f]{64}$/i.test(x) ? "hex64" : typeof x;
  if (depth > 5) return "…";
  if (Array.isArray(x)) return x.length ? [shape(x[0], depth + 1), `(len ${x.length})`] : "[]";
  const proto = Object.getPrototypeOf(x);
  const cls = proto && proto !== Object.prototype ? proto.constructor?.name : null;
  let v = x;
  if (cls && cls !== "Map" && typeof x.toJSON === "function") {
    try { v = x.toJSON(); } catch (e) { return `${cls}{toJSON threw: ${e?.message}}`; }
  }
  if (v instanceof Map) v = Object.fromEntries(v);
  if (v === null || typeof v !== "object") return `${cls ?? ""}→${shape(v, depth + 1)}`;
  const o = {};
  for (const [key, val] of Object.entries(v)) o[key] = shape(val, depth + 1);
  return cls ? { [`<${cls}>`]: o } : o;
}

const samples = {};
const take = (name, x) => { if (!(name in samples)) samples[name] = shape(x); };

const rpc = new k.RpcClient({ url: rpcUrl, encoding: k.Encoding.SerdeJson, networkId: "simnet" });
await rpc.connect({ blockAsyncConnect: true });
rpc.addEventListener("utxos-changed", (e) => { take("rawRpc utxos-changed event", e); take("rawRpc added[0]", e?.data?.added?.[0]); });
await rpc.subscribeUtxosChanged([A]);

const rpc2 = new k.RpcClient({ url: rpcUrl, encoding: k.Encoding.SerdeJson, networkId: "simnet" });
await rpc2.connect({ blockAsyncConnect: true });
const proc = new k.UtxoProcessor({ rpc: rpc2, networkId: "simnet" });
const ctx = new k.UtxoContext({ processor: proc });
proc.addEventListener((e) => {
  take(`proc ${e.type}`, e);
  if (e.type === "pending" || e.type === "maturity" || e.type === "stasis") {
    try { take(`proc ${e.type} data.serialize()`, e.data?.serialize?.()); } catch (err) { samples[`proc ${e.type} serialize`] = `threw ${err?.message}`; }
  }
});
await proc.start();
await ctx.trackAddresses([A]);

try { execSync(`docker rm -f ${MINER}`, { stdio: "ignore" }); } catch {}
execSync(`docker run -d --name ${MINER} --network=container:${NODE} ${core.CPUMINER_REFERENCE_IMAGE} --mining-address ${A} --kaspad-address 127.0.0.1 --port ${core.CANONICAL_LOCALNET.ports.rpc} --threads 1 --mine-when-not-synced`, { stdio: "ignore" });
await new Promise((r) => setTimeout(r, SECONDS * 1000));
try { execSync(`docker rm -f ${MINER}`, { stdio: "ignore" }); } catch {}
await new Promise((r) => setTimeout(r, 4000));

take("ctx.getPending()[0]", ctx.getPending()[0]);
take("ctx.getMatureRange(0,1)[0]", ctx.matureLength ? ctx.getMatureRange(0, 1)[0] : null);
samples["ctx counts"] = { matureLength: ctx.matureLength, pending: ctx.getPending().length };
const u = await rpc.getUtxosByAddresses({ addresses: [A] });
take("getUtxosByAddresses entries[0]", u?.entries?.[0]);
samples["getUtxosByAddresses count"] = u?.entries?.length;
console.log(JSON.stringify(samples, (_, v) => (typeof v === "bigint" ? `${v}n` : v), 2));
await proc.stop();
await rpc2.disconnect();
await rpc.disconnect();
process.exit(0);
