// Independent check of the 3b record run: reads ONLY <record>.snapshots.json (full sets) and redoes
// the set arithmetic by hand, without gap-lib.mjs or decide(). Prints each fact the verdict rests on.
// usage: node verify-gap-record.mjs <snapshots.json>
import fs from "node:fs";

const s = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const snap = (label) => s.snapshots[label];
const asMap = (entries) => new Map(entries);
const minus = (a, b) => [...a.keys()].filter((k) => !b.has(k)).sort();
const eqList = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const sameAmounts = (a, b) => [...a.keys()].filter((k) => b.has(k)).every((k) => a.get(k) === b.get(k));
const { gapInputs, gapChange, postInputs, postChange } = s.expected;
const facts = [];
const fact = (name, ok, detail) => facts.push({ ok: !!ok, name, ...(detail ? { detail } : {}) });

const T0 = asMap(snap("before-gap").truth);
const Tg = asMap(snap("during-gap").truth);
const T2 = asMap(snap("after-reconnect").truth);
const T3 = asMap(snap("after-control-spend").truth);

// the node itself
fact("node: T_gap = T0 − gapInputs + gapChange", eqList(minus(T0, Tg), gapInputs) && eqList(minus(Tg, T0), gapChange), { removed: minus(T0, Tg), added: minus(Tg, T0) });
fact("node: unchanged UTXOs keep their amounts across the gap", sameAmounts(T0, Tg));
fact("node: nothing moved between the end of the gap and the reconnect", eqList(minus(Tg, T2), []) && eqList(minus(T2, Tg), []));
fact("node: T3 = T2 − postInputs + postChange", eqList(minus(T2, T3), postInputs) && eqList(minus(T3, T2), postChange));

// every candidate at every checkpoint
for (const label of ["before-gap", "during-gap", "after-reconnect", "after-control-spend"]) {
  const T = asMap(snap(label).truth);
  for (const [name, entries] of Object.entries(snap(label).candidates)) {
    const c = asMap(entries);
    fact(`${label} · ${name}: extra ${JSON.stringify(minus(c, T).length)}, missing ${JSON.stringify(minus(T, c).length)}`, true, { extra: minus(c, T), missing: minus(T, c), amountsAgree: sameAmounts(c, T) });
  }
}

// the facts the approved criterion needs
const R2 = asMap(snap("after-reconnect").candidates.R);
const U2 = asMap(snap("after-reconnect").candidates.U);
const R3 = asMap(snap("after-control-spend").candidates.R);
const U3 = asMap(snap("after-control-spend").candidates.U);
const L = ["before-gap", "during-gap", "after-reconnect", "after-control-spend"].map((l) => [l, asMap(snap(l).candidates.L), asMap(snap(l).truth)]);
fact("L (live control) equals the truth at every checkpoint", L.every(([, c, t]) => eqList(minus(c, t), []) && eqList(minus(t, c), []) && sameAmounts(c, t)));
fact("R after reconnect: extra = exactly the gap inputs", eqList(minus(R2, T2), gapInputs), minus(R2, T2));
fact("R after reconnect: missing = exactly the gap change", eqList(minus(T2, R2), gapChange), minus(T2, R2));
fact("U after reconnect equals the truth (outpoints and amounts)", eqList(minus(U2, T2), []) && eqList(minus(T2, U2), []) && sameAmounts(U2, T2));
fact("R after the control spend: the post-heal spend applied live (inputs gone, change present)", postInputs.every((op) => !R3.has(op)) && postChange.every((op) => R3.has(op)));
fact("R after the control spend: still exactly the inherited gap", eqList(minus(R3, T3), gapInputs) && eqList(minus(T3, R3), gapChange));
fact("U after the control spend equals the truth", eqList(minus(U3, T3), []) && eqList(minus(T3, U3), []) && sameAmounts(U3, T3));

const decisive = facts.slice(-7);
console.log(JSON.stringify({ decisiveAllTrue: decisive.every((f) => f.ok), facts }, null, 2));
