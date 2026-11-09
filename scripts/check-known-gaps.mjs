#!/usr/bin/env node
// CA-EV-11 · every test skipped as a "[known gap: …]" must be listed in docs/status/limitations.md, so a known defect
// never reads as a silent pass. Scans packages/*/test and examples/*/test for `.skip(` lines carrying the label and
// checks that the label text (before " -> ticket") appears in limitations.md.
// Usage: node scripts/check-known-gaps.mjs   (exit 1 when a label is missing)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIMITATIONS = path.join(ROOT, "docs", "status", "limitations.md");
const doc = fs.readFileSync(LIMITATIONS, "utf8");

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|mts|js|mjs)$/.test(e.name)) out.push(p);
  }
}

const files = [];
for (const top of ["packages", "examples"]) {
  const base = path.join(ROOT, top);
  if (!fs.existsSync(base)) continue;
  for (const pkg of fs.readdirSync(base)) walk(path.join(base, pkg, "test"), files);
}

const LABEL = /\.skip\(\s*["'`]\[known gap: ([^\]]+?)(?: -> [^\]]+)?\]/;
const found = [];
for (const f of files) {
  const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    const m = LABEL.exec(line);
    if (m) found.push({ file: path.relative(ROOT, f).split(path.sep).join("/"), line: i + 1, gap: m[1].trim() });
  });
}
const missing = found.filter((g) => !doc.includes(g.gap));
console.log(`known-gap skips: ${found.length} in ${new Set(found.map((g) => g.file)).size} files; listed in limitations.md: ${found.length - missing.length}`);
for (const g of missing) console.error(`MISSING ${g.file}:${g.line} [known gap: ${g.gap}]`);
process.exit(missing.length === 0 ? 0 : 1);
