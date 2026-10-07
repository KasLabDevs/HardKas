// Surface Cut 3a closure: before vs after, the way users receive the packages
// (packed-smoke.mjs label dirs). Everything that differs is listed; the expectation is
// that the only differences are @hardkas/rpc-events itself and the sdk's edge to it.
//  - packed manifests (dependency sections, exports, bin) of every package in both sets;
//  - per consumer (npm, strict pnpm): install, @hardkas/* installed, third-party set,
//    registry provenance, every import, every CLI step (status, json ok, output tails
//    normalised for paths / hashes / timestamps), and the plan.json the journey writes.
// usage: node compare-consumers.mjs <beforeLabelDir> <afterLabelDir>
import fs from "node:fs";
import path from "node:path";

const [bDir, aDir] = process.argv.slice(2).map((a) => path.resolve(a));
const load = (d) => JSON.parse(fs.readFileSync(path.join(d, "result.json"), "utf8"));
const B = load(bDir);
const A = load(aDir);
// Run 1 of this comparison (kept as compare-consumers-run1-harness.json) had three harness
// faults: `minus` consumed its second argument (a Map iterator) on the first element, so almost
// every package and import showed as both removed and added; manifests were compared
// order-sensitively, and `pnpm pack` writes resolved workspace dependencies in varying order;
// import errors were compared on text truncated at 200 characters whose paths differ in length
// ("before" vs "after"). Fixed below: materialised sets, sorted-key JSON, and errors reduced
// to their code and the missing package.
const minus = (x, y) => {
  const s = new Set(y);
  return [...x].filter((v) => !s.has(v));
};
const canon = (v) =>
  JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const errKey = (e) => {
  if (!e) return null;
  const code = /^([A-Z_]+):/.exec(e)?.[1] ?? "";
  const pkg = /Cannot find (?:package|module) '([^']+)'/.exec(e)?.[1] ?? "";
  return `${code} ${pkg}`.trim() || norm(e);
};
const norm = (s) =>
  String(s ?? "")
    .replace(/hk-3a(\\\\|\\|\/)(before|after)/g, "hk-3a/<L>")
    .replace(/\\\\/g, "/")
    .replace(/\\/g, "/")
    .replace(/\b[0-9a-f]{64}\b/gi, "<hex64>")
    .replace(/\b[0-9a-f]{32}\b/gi, "<hex32>")
    .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, "<ts>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/(file\+\.\.\+ta)_[0-9a-f]+/g, "$1_<h>")
    .replace(/"(durationMs|elapsedMs|ms|createdAtMs|timestamp)":\s*\d+/g, '"$1":<n>');

const report = { before: bDir, after: aDir, packs: {}, manifests: [], consumers: {} };

// packs and packed manifests
const bPacks = new Map(B.packs.map((p) => [p.name, p]));
const aPacks = new Map(A.packs.map((p) => [p.name, p]));
report.packs = { before: bPacks.size, after: aPacks.size, removed: minus(bPacks.keys(), aPacks.keys()), added: minus(aPacks.keys(), bPacks.keys()) };
for (const [name, a] of aPacks) {
  const b = bPacks.get(name);
  if (!b) continue;
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "exports", "bin"]) {
    const bj = canon(b[field] ?? null);
    const aj = canon(a[field] ?? null);
    if (bj === aj) continue;
    const entry = { package: name, field };
    if (field.endsWith("ependencies")) {
      entry.removed = minus(Object.keys(b[field] ?? {}), Object.keys(a[field] ?? {}));
      entry.added = minus(Object.keys(a[field] ?? {}), Object.keys(b[field] ?? {}));
      entry.changed = Object.keys(a[field] ?? {}).filter((k) => b[field]?.[k] !== undefined && norm(b[field][k]) !== norm(a[field][k]));
    }
    report.manifests.push(entry);
  }
}

// consumers
for (const pm of ["npm", "pnpm"]) {
  const b = B.consumers[pm] ?? {};
  const a = A.consumers[pm] ?? {};
  const c = {
    install: { before: b.install?.status, after: a.install?.status },
    hardkasInstalled: { before: b.hardkasInstalled?.length, after: a.hardkasInstalled?.length, removed: minus(b.hardkasInstalled ?? [], a.hardkasInstalled ?? []), added: minus(a.hardkasInstalled ?? [], b.hardkasInstalled ?? []) },
    thirdParty: { before: b.thirdParty?.length, after: a.thirdParty?.length, removed: minus(b.thirdParty ?? [], a.thirdParty ?? []), added: minus(a.thirdParty ?? [], b.thirdParty ?? []) },
    hardkasFromRegistry: { before: b.hardkasFromRegistry?.length, after: a.hardkasFromRegistry?.length },
    workspaceLeak: { before: b.workspaceLeak, after: a.workspaceLeak },
    version: { before: b.version, after: a.version }
  };
  const bi = new Map((Array.isArray(b.imports) ? b.imports : []).map((i) => [i.spec, i]));
  const ai = new Map((Array.isArray(a.imports) ? a.imports : []).map((i) => [i.spec, i]));
  c.imports = {
    before: { ok: [...bi.values()].filter((i) => i.ok).length, failed: [...bi.values()].filter((i) => !i.ok).length },
    after: { ok: [...ai.values()].filter((i) => i.ok).length, failed: [...ai.values()].filter((i) => !i.ok).length },
    removedSpecs: minus(bi.keys(), ai.keys()),
    addedSpecs: minus(ai.keys(), bi.keys()),
    changed: [...ai.keys()].filter((k) => bi.has(k) && (bi.get(k).ok !== ai.get(k).ok || errKey(bi.get(k).error) !== errKey(ai.get(k).error))).map((k) => ({ spec: k, before: bi.get(k), after: ai.get(k) })),
    failedBoth: [...ai.keys()].filter((k) => bi.has(k) && !bi.get(k).ok && !ai.get(k).ok).map((k) => `${k} → ${errKey(ai.get(k).error)}`)
  };
  const bs = b.steps ?? [];
  const as = a.steps ?? [];
  c.steps = { before: bs.length, after: as.length, allOkBefore: bs.every((s) => s.status === 0), allOkAfter: as.every((s) => s.status === 0), differences: [] };
  for (let i = 0; i < Math.max(bs.length, as.length); i++) {
    const x = bs[i];
    const y = as[i];
    const d = [];
    if (x?.cmd !== y?.cmd) d.push("cmd");
    if (x?.status !== y?.status) d.push("status");
    if (x?.jsonOk !== y?.jsonOk) d.push("jsonOk");
    if (norm(x?.out) !== norm(y?.out)) d.push("out");
    if (norm(x?.err) !== norm(y?.err)) d.push("err");
    if (d.length) c.steps.differences.push({ step: y?.cmd ?? x?.cmd, fields: d, before: { out: norm(x?.out), err: norm(x?.err) }, after: { out: norm(y?.out), err: norm(y?.err) } });
  }
  // the plan the journey wrote, normalised
  const planOf = (d) => {
    const f = path.join(d, `${pm}-consumer`, "smoke-proj", "plan.json");
    return fs.existsSync(f) ? norm(fs.readFileSync(f, "utf8")) : null;
  };
  const bp = planOf(bDir);
  const ap = planOf(aDir);
  c.planJson = { before: bp !== null, after: ap !== null, identicalAfterNormalising: bp !== null && bp === ap };
  if (bp !== null && ap !== null && bp !== ap) {
    const bl = bp.split(/\r?\n/);
    const al = ap.split(/\r?\n/);
    c.planJson.differingLines = al.map((l, i) => (l !== bl[i] ? { line: i + 1, before: bl[i], after: l } : null)).filter(Boolean).slice(0, 12);
  }
  report.consumers[pm] = c;
}
console.log(JSON.stringify(report, null, 2));
