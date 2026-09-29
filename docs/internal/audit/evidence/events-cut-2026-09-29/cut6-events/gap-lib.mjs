// 3b gap experiment · shared pieces (design: 3b-GAP-EXPERIMENT-DESIGN.md).
//  - createPartitionProxy: a loopback TCP proxy in front of the node's wRPC port. partition()
//    stops listening and destroys every piped socket (both ends), so proxied clients lose the
//    node while it keeps running; heal() listens again on the same port.
//  - UTXO sets: Map<"txid:index", amount string>; notifications applied removed-first (the node
//    re-reports an outpoint whose DAA score changed as removed + added in one notification).
//  - decide(): the reviewer-approved criterion (29-sep) as a pure function.
import net from "node:net";

export function createPartitionProxy({ host, port: targetPort }) {
  const pairs = new Set();
  let server = null;
  let listenPort = 0;
  const counters = { accepted: 0, cutByPartition: 0, maxActive: 0, acceptedWhilePartitioned: 0 };
  const onConnection = (client) => {
    counters.accepted++;
    const upstream = net.connect(targetPort, host);
    const pair = { client, upstream };
    pairs.add(pair);
    counters.maxActive = Math.max(counters.maxActive, pairs.size);
    const close = () => {
      client.destroy();
      upstream.destroy();
      pairs.delete(pair);
    };
    client.on("error", close);
    upstream.on("error", close);
    client.on("close", close);
    upstream.on("close", close);
    client.pipe(upstream);
    upstream.pipe(client);
  };
  return {
    counters,
    get port() { return listenPort; },
    get url() { return `ws://127.0.0.1:${listenPort}`; },
    get listening() { return server !== null; },
    active: () => pairs.size,
    async listen() {
      if (server) return;
      const s = net.createServer(onConnection);
      await new Promise((resolve, reject) => {
        s.once("error", reject);
        s.listen(listenPort, "127.0.0.1", () => {
          s.off("error", reject);
          resolve();
        });
      });
      listenPort = s.address().port;
      server = s;
    },
    async partition() {
      const s = server;
      server = null;
      const closed = s ? new Promise((resolve) => s.close(() => resolve())) : Promise.resolve();
      for (const p of [...pairs]) {
        p.client.destroy();
        p.upstream.destroy();
        pairs.delete(p);
        counters.cutByPartition++;
      }
      await closed;
    },
    async heal() {
      await this.listen();
    }
  };
}

export const opOf = (txid, index) => `${String(txid).toLowerCase()}:${Number(index)}`;

/** UTXO entries of any shape seen so far: kaspa-wasm UtxoEntryReference (getters), HardKAS-mapped entries, wire JSON. */
export function entryMap(list) {
  const m = new Map();
  for (const u of Array.isArray(list) ? list : []) {
    const o = u?.outpoint ?? u?.entry?.outpoint;
    if (!o) continue;
    const amount = u.amount ?? u.amountSompi ?? u.utxoEntry?.amount ?? u.entry?.amount;
    m.set(opOf(o.transactionId, o.index), amount === undefined || amount === null ? null : String(amount));
  }
  return m;
}

/** Removed first, then added: an outpoint in both is the same UTXO re-reported. */
export function applyNotification(set, removed, added) {
  for (const op of removed.keys()) set.delete(op);
  for (const [op, amount] of added) set.set(op, amount);
}

export function diffSets(candidate, truth) {
  const missing = [...truth.keys()].filter((op) => !candidate.has(op)).sort();
  const extra = [...candidate.keys()].filter((op) => !truth.has(op)).sort();
  const amountMismatch = [...candidate.keys()]
    .filter((op) => truth.has(op) && candidate.get(op) !== null && candidate.get(op) !== truth.get(op))
    .sort();
  return { size: candidate.size, truth: truth.size, missing, extra, amountMismatch };
}

export const isExact = (d) => !!d && d.missing.length === 0 && d.extra.length === 0 && d.amountMismatch.length === 0;
export const sameMembers = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

/**
 * The approved criterion. validity: { V1..V7: { ok, why } }; gap: { inputs, change } of the spend made
 * while the proxied candidates were cut off; R and U: { C2, C3 } diffs against the fresh truth.
 */
export function decide({ validity, gap, R, U }) {
  const invalid = Object.entries(validity).filter(([, v]) => !v?.ok).map(([k, v]) => `${k}: ${v?.why ?? "failed"}`);
  if (invalid.length) return { verdict: "INVALID", reasons: invalid };
  const gapDeltaExact = (d) => !!d && sameMembers(d.extra, gap.inputs) && sameMembers(d.missing, gap.change) && d.amountMismatch.length === 0;
  if (isExact(R.C2) && isExact(R.C3)) {
    return { verdict: "RESUBSCRIBE_SUFFICIENT", reasons: ["R equals the fresh truth after the heal and after the post-heal spend"] };
  }
  if (!isExact(R.C2) && gapDeltaExact(R.C2) && gapDeltaExact(R.C3) && isExact(U.C2) && isExact(U.C3)) {
    return {
      verdict: "UTXOCONTEXT_REQUIRED",
      reasons: [
        "R keeps exactly the inputs spent while it was disconnected and lacks exactly the change",
        "R still applies the post-heal spend live (its C3 difference is only the inherited gap)",
        "U equals the fresh truth at C2 and C3"
      ]
    };
  }
  return { verdict: "INCONCLUSIVE", reasons: ["neither outcome of the criterion matched exactly; investigate the harness before deciding"] };
}
