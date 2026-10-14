// SECURITY-INTEGRATION-1: every path changed vs the baseline index tree — BOM, mojibake, conflict markers.
import fs from "node:fs";
import { execSync } from "node:child_process";
const root = "C:/Users/jrodr/hkl1/si/src";
const base = process.argv[2] ?? "cc3d4dbc";
const out = execSync(`git -c core.quotepath=off diff --cached --name-only ${base}`, { cwd: root, encoding: "utf8" });
const files = out.split(/\r?\n/).filter(Boolean);
let bad = 0;
const MOJI = /\u00e2\u20ac|\u00c3[\u0080-\u00bf\u00a0-\u00ff]|\u00c2[\u00a0-\u00bf]|\ufffd/;
for (const f of files) {
  const p = `${root}/${f}`;
  if (!fs.existsSync(p)) continue;
  const buf = fs.readFileSync(p);
  if (buf.includes(0)) continue; // binary
  const s = buf.toString("utf8");
  const issues = [];
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) issues.push("BOM");
  if (MOJI.test(s)) issues.push("mojibake");
  if (/^(<<<<<<< |>>>>>>> )/m.test(s)) issues.push("conflict-marker");
  if (issues.length) {
    bad++;
    console.log(`${f}: ${issues.join(",")}`);
  }
}
console.log(`checked ${files.length} paths; flagged ${bad}`);
