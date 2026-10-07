const fs = require("fs"), path = require("path");
const [b, a] = process.argv.slice(2);
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => p.localeCompare(q))) : x));
const out = {};
for (const dir of fs.readdirSync(a)) {
  const pa = path.join(a, dir, "package", "package.json"), pb = path.join(b, dir, "package", "package.json");
  if (!fs.existsSync(pa) || !fs.existsSync(pb)) continue;
  const ta = fs.readFileSync(pa, "utf8"), tb = fs.readFileSync(pb, "utf8");
  if (ta === tb) continue;
  const A = JSON.parse(ta), B = JSON.parse(tb);
  if (canon(A) === canon(B)) { out[dir] = "same content, different key order"; continue; }
  const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])].filter((k) => canon(A[k]) !== canon(B[k]));
  out[dir] = Object.fromEntries(keys.map((k) => [k, { before: B[k], after: A[k] }]));
}
console.log(JSON.stringify(out, null, 2));
