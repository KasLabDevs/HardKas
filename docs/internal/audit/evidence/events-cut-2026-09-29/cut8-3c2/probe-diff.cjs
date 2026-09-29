// Surface Cut 3c-2 · compares two surface-probe-3c2 outputs (BEFORE vs AFTER) key by key.
// The probe JSON was redirected by PowerShell 5.1, which writes a UTF-8 BOM: strip it.
// usage: node probe-diff.cjs <before.json> <after.json>
const fs = require("fs");
const read = (f) => {
  const s = fs.readFileSync(f, "utf8");
  return JSON.parse(s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
};
const [b, a] = process.argv.slice(2).map(read);
const diff = {};
for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
  if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) diff[k] = { before: b[k], after: a[k] };
}
console.log("differing keys:", JSON.stringify(Object.keys(diff)));
for (const [k, v] of Object.entries(diff)) {
  if (k === "classes" || k === "mentions") continue;
  console.log(k, JSON.stringify(v));
}
if (diff.classes) {
  for (const c of Object.keys(a.classes)) {
    const before = b.classes[c];
    const after = a.classes[c];
    console.log(`class ${c} | removed before ${JSON.stringify(before.removed)} after ${JSON.stringify(after.removed)} | kept identical: ${JSON.stringify(before.kept) === JSON.stringify(after.kept)}`);
  }
}
if (diff.mentions) console.log("mentions after:", JSON.stringify(a.mentions));
