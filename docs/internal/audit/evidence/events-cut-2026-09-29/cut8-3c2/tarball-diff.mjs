// Surface Cut 3c-2 (the 3c-1 script with the 3c-2 names) · what users receive, before vs after, file by file.
// For every tarball of two packed sets (packed-smoke.mjs label dirs): the list of files inside
// and the sha256 of each one. Reports, per package, the files removed, added and changed, and
// searches every file of the "after" set for the removed names.
// Extraction goes under <workDir> (outside the repository).
// usage: node tarball-diff.mjs <beforeLabelDir> <afterLabelDir> <workDir>
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [bDir, aDir, work] = process.argv.slice(2).map((a) => path.resolve(a));
const NEEDLES = ["subscribeToUtxosChanged", "subscribeToVirtualChainChanged", "UtxosChangedEvent", "VirtualChainChangedEvent", "RpcAcceptedTransactionIds", "KaspaSubscription", "OFFICIAL_EVENTS", "RPC_SUBSCRIPTIONS_UNSUPPORTED", "subscribeUtxosChanged", "subscribeVirtualChainChanged"];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function inventory(labelDir, tag) {
  const packed = JSON.parse(fs.readFileSync(path.join(labelDir, "result.json"), "utf8"));
  const set = new Map();
  for (const p of packed.packs) {
    const dir = path.join(work, tag, p.name.replace("/", "__"));
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    execFileSync("tar", ["-xzf", p.tarball, "-C", dir]);
    const files = new Map();
    for (const f of walk(dir)) {
      const buf = fs.readFileSync(f);
      files.set(path.relative(dir, f).split(path.sep).join("/"), { sha: crypto.createHash("sha256").update(buf).digest("hex"), text: buf.toString("latin1") });
    }
    set.set(p.name, { tarball: path.basename(p.tarball), files });
  }
  return set;
}

const B = inventory(bDir, "before");
const A = inventory(aDir, "after");
const report = { before: bDir, after: aDir, packages: { before: B.size, after: A.size }, packagesRemoved: [...B.keys()].filter((n) => !A.has(n)), packagesAdded: [...A.keys()].filter((n) => !B.has(n)), changed: {}, identical: [], afterMentions: [] };
for (const [name, a] of A) {
  const b = B.get(name);
  if (!b) continue;
  const removed = [...b.files.keys()].filter((f) => !a.files.has(f)).sort();
  const added = [...a.files.keys()].filter((f) => !b.files.has(f)).sort();
  const modified = [...a.files.keys()].filter((f) => b.files.has(f) && b.files.get(f).sha !== a.files.get(f).sha).sort();
  if (removed.length || added.length || modified.length) report.changed[name] = { files: { before: b.files.size, after: a.files.size }, removed, added, modified };
  else report.identical.push(name);
  for (const [f, { text }] of a.files) {
    const found = NEEDLES.filter((n) => text.includes(n));
    if (found.length) report.afterMentions.push({ package: name, file: f, found });
  }
}
report.identicalCount = report.identical.length;
console.log(JSON.stringify(report, null, 2));
