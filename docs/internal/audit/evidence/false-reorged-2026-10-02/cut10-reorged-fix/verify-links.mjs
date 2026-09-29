// Every `chain_accepted` HardKAS sealed with a `removedAcceptingBlockHash` in a record run, re-asked of
// the node afterwards (kaspa-wasm RpcClient directly; no HardKAS observer/derivation code): does the node
// itself say that the replaced block left the selected chain, and which chain block now accepts the tx?
// Also: does the node know the replaced block at all (HardKAS cannot have invented it)?
// usage: node verify-links.mjs <wtRoot> <recordDir>   (the record's node must be running)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const wt = path.resolve(process.argv[2]);
const dir = path.resolve(process.argv[3]);
const req = createRequire(path.join(wt, "packages", "kaspa-rpc", "package.json"));
const ws = req("ws");
globalThis.WebSocket = ws.WebSocket ?? ws;
const core = await import(pathToFileURL(path.join(wt, "packages", "core", "dist", "index.js")).href);
const k = core.loadManagedKaspaWasmSync();
const rpc = new k.RpcClient({ url: core.nodeRpcUrl(), encoding: k.Encoding.SerdeJson, networkId: "simnet" });
for (let attempt = 1; ; attempt++) {
  try {
    await rpc.connect({ blockAsyncConnect: true, strategy: "fallback", timeoutDuration: 15000 });
    break;
  } catch (e) {
    if (attempt >= 20) throw e;
    await new Promise((r) => setTimeout(r, 3000));
  }
}
const run = JSON.parse(fs.readFileSync(path.join(dir, "run.json"), "utf8"));
const rows = [];
for (const t of run.txs.filter((x) => x.file)) {
  const tx = JSON.parse(fs.readFileSync(path.join(dir, t.file), "utf8"));
  const truth = new Set(tx.events.filter((e) => e.kind === "accepting" && e.to).map((e) => e.to));
  for (const o of tx.hardkas.observations) {
    const f = o.finding ?? {};
    if (f.type !== "chain_accepted" || !f.removedAcceptingBlockHash) continue;
    const row = { tx: tx.index, observedAt: o.observedAt, removed: f.removedAcceptingBlockHash, accepting: f.acceptingBlockHash, recorderSawRemoved: truth.has(f.removedAcceptingBlockHash), recorderSawAccepting: truth.has(f.acceptingBlockHash) };
    try {
      const b = await rpc.getBlock({ hash: f.removedAcceptingBlockHash, includeTransactions: false });
      const vd = b?.block?.verboseData ?? {};
      row.removedKnownToNode = true;
      row.removedIsChainBlockNow = vd.isChainBlock ?? null;
      row.removedBlueScore = String(b?.block?.header?.blueScore ?? "");
    } catch (e) {
      row.removedKnownToNode = false;
      row.removedError = String(e?.message ?? e).slice(0, 200);
    }
    try {
      const vc = await rpc.getVirtualChainFromBlock({ startHash: f.removedAcceptingBlockHash, includeAcceptedTransactionIds: true });
      const removed = (vc.removedChainBlockHashes ?? []).map(String);
      const hit = (vc.acceptedTransactionIds ?? []).find((a) => (a.acceptedTransactionIds ?? []).map(String).includes(tx.txId));
      row.nodeSaysRemovedLeftChain = removed.includes(f.removedAcceptingBlockHash);
      row.nodeAcceptingNow = hit ? String(hit.acceptingBlockHash) : null;
      row.nodeAcceptingNowIsHardkasBlock = hit ? String(hit.acceptingBlockHash) === f.acceptingBlockHash : false;
    } catch (e) {
      row.vchainError = String(e?.message ?? e).slice(0, 200);
    }
    rows.push(row);
  }
}
await rpc.disconnect().catch(() => {});
const summary = {
  links: rows.length,
  removedKnownToNode: rows.filter((r) => r.removedKnownToNode).length,
  removedNotChainNow: rows.filter((r) => r.removedIsChainBlockNow === false).length,
  nodeSaysRemovedLeftChain: rows.filter((r) => r.nodeSaysRemovedLeftChain).length,
  nodeAcceptingNowIsHardkasBlock: rows.filter((r) => r.nodeAcceptingNowIsHardkasBlock).length,
  recorderSawRemoved: rows.filter((r) => r.recorderSawRemoved).length
};
console.log(JSON.stringify({ summary, rows }, null, 2));
process.exit(0);
