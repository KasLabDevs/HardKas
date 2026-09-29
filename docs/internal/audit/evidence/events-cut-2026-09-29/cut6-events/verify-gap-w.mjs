// Independent check of the 3b closure run: reads the raw snapshots (<record>.snapshots.json) and
// W's raw event log (<record>.json candidates.W.watchEvents) and redoes every fact by hand,
// without gap-lib.mjs, decide() or the harness's closure3b.
// usage: node verify-gap-w.mjs <record.json>
import fs from "node:fs";

const recordFile = process.argv[2];
const main = JSON.parse(fs.readFileSync(recordFile, "utf8"));
const s = JSON.parse(fs.readFileSync(recordFile.replace(/\.json$/, "") + ".snapshots.json", "utf8"));
const snap = (label) => s.snapshots[label];
const asMap = (entries) => new Map(entries);
const minus = (a, b) => [...a.keys()].filter((k) => !b.has(k)).sort();
const eqList = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const sameAmounts = (a, b) => [...a.keys()].filter((k) => b.has(k)).every((k) => a.get(k) === b.get(k));
const exact = (c, t) => eqList(minus(c, t), []) && eqList(minus(t, c), []) && sameAmounts(c, t);
const key = (x) => `${String(x.transactionId).toLowerCase()}:${Number(x.index)}`;
const { gapInputs, gapChange, postInputs, postChange } = s.expected;
const facts = [];
const fact = (name, ok, detail) => facts.push({ ok: !!ok, name, ...(detail !== undefined ? { detail } : {}) });

const T0 = asMap(snap("before-gap").truth);
const Tg = asMap(snap("during-gap").truth);
const T2 = asMap(snap("after-reconnect").truth);
const T3 = asMap(snap("after-control-spend").truth);
fact("node: T_gap = T0 − gapInputs + gapChange", eqList(minus(T0, Tg), gapInputs) && eqList(minus(Tg, T0), gapChange));
fact("node: nothing moved between the end of the gap and the reconnect", eqList(minus(Tg, T2), []) && eqList(minus(T2, Tg), []));
fact("node: T3 = T2 − postInputs + postChange", eqList(minus(T2, T3), postInputs) && eqList(minus(T3, T2), postChange));

for (const label of ["before-gap", "during-gap", "after-reconnect", "after-control-spend"]) {
  const T = asMap(snap(label).truth);
  const L = asMap(snap(label).candidates.L);
  fact(`L equals the truth at ${label}`, exact(L, T));
}
const W0 = asMap(snap("before-gap").candidates.W);
const W2 = asMap(snap("after-reconnect").candidates.W);
const W3 = asMap(snap("after-control-spend").candidates.W);
fact("W equals the truth before the gap (outpoints and amounts)", exact(W0, T0));
fact("W.utxos() equals the fresh node snapshot after the resync (outpoints and amounts)", exact(W2, T2), { extra: minus(W2, T2), missing: minus(T2, W2) });
fact("W.utxos() equals the fresh node snapshot after the later spend (outpoints and amounts)", exact(W3, T3), { extra: minus(W3, T3), missing: minus(T3, W3) });

const healAt = main.timeline?.healAt;
const events = main.candidates?.W?.watchEvents ?? [];
const resyncs = events.filter((e) => e.type === "resync" && e.at >= healAt);
fact("exactly one resync event after the heal", resyncs.length === 1, resyncs.length);
const r = resyncs[0] ?? { removed: [], added: [] };
fact("resync.removed = exactly the inputs spent during the cut", eqList(r.removed.map(key), gapInputs), r.removed.map(key));
fact("resync.added = exactly the change created during the cut", eqList(r.added.map(key), gapChange), r.added.map(key));
fact("resync amounts are the node's (removed from T0, added from T2)", r.removed.every((x) => T0.get(key(x)) === String(x.amountSompi)) && r.added.every((x) => T2.get(key(x)) === String(x.amountSompi)));
fact("resync.reason is \"reconnect\"", r.reason === "reconnect");
const gapKeys = new Set([...gapInputs, ...gapChange]);
const gapAsTx = events.filter((e) => e.type === "transaction" && [...(e.details?.added ?? []), ...(e.details?.removed ?? [])].some((x) => gapKeys.has(key(x))));
fact("the cut never appears as a transaction event", gapAsTx.length === 0, gapAsTx.length);
const post = events.filter((e) => e.type === "transaction" && e.at >= main.spends.post.submittedAt);
fact(
  "the later spend arrives live as transaction events: removed = its inputs, added = its change",
  eqList(post.flatMap((e) => (e.details?.removed ?? []).map(key)), postInputs) && eqList(post.flatMap((e) => (e.details?.added ?? []).map(key)), postChange),
  post.map((e) => ({ txid: e.txid, removed: (e.details?.removed ?? []).map(key), added: (e.details?.added ?? []).map(key) }))
);

// replication of the record run (R and U), for context
const R2 = asMap(snap("after-reconnect").candidates.R);
const U2 = asMap(snap("after-reconnect").candidates.U);
fact("replication: R keeps exactly the gap inputs and lacks exactly the change after the reconnect", eqList(minus(R2, T2), gapInputs) && eqList(minus(T2, R2), gapChange));
fact("replication: U equals the truth after the reconnect", exact(U2, T2));

console.log(JSON.stringify({ allTrue: facts.every((f) => f.ok), facts }, null, 2));
