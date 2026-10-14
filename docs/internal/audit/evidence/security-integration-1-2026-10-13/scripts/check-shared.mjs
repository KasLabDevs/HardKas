// SECURITY-INTEGRATION-1: for each path changed by several waves, every line a wave ADDED must be in si, and every line
// a wave REMOVED must be gone from si unless another wave's version keeps it (multiset, EOL-normalized).
import fs from "node:fs";
import { execSync } from "node:child_process";
const SI = "C:/Users/jrodr/hkl1/si/src";
const W = { nni: "C:/Users/jrodr/hkl1/nni/src", ea: "C:/Users/jrodr/hkl1/ea/src", mg: "C:/Users/jrodr/hkl1/mg/src" };
const shared = {
  "packages/cli/src/runners/accounts-consolidate-runner.ts": ["nni", "mg"],
  "packages/kaspa-rpc/src/index.ts": ["nni", "ea"],
  "packages/kaspa-rpc/src/wrpc-client.ts": ["nni", "ea"],
  "packages/sdk/src/tx.ts": ["nni", "ea", "mg"]
};
const lines = (s) => s.replace(/\r\n/g, "\n").split("\n");
const count = (arr) => arr.reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());
for (const [p, ks] of Object.entries(shared)) {
  const base = lines(execSync(`git show cc3d4dbc:${p}`, { cwd: SI, encoding: "utf8", maxBuffer: 1 << 26 }));
  const si = count(lines(fs.readFileSync(`${SI}/${p}`, "utf8")));
  const bc = count(base);
  const report = [];
  for (const k of ks) {
    const wc = count(lines(fs.readFileSync(`${W[k]}/${p}`, "utf8")));
    for (const [l, n] of wc) {
      const added = n - (bc.get(l) ?? 0);
      if (added > 0 && (si.get(l) ?? 0) < n && l.trim()) report.push(`${k} ADDED missing: ${l.trim().slice(0, 140)}`);
    }
    for (const [l, n] of bc) {
      const removed = n - (wc.get(l) ?? 0);
      if (removed > 0 && (si.get(l) ?? 0) > n - removed && l.trim()) {
        const keptByOther = ks.some((o) => o !== k && (count(lines(fs.readFileSync(`${W[o]}/${p}`, "utf8"))).get(l) ?? 0) >= (si.get(l) ?? 0));
        if (!keptByOther) report.push(`${k} REMOVED still present: ${l.trim().slice(0, 140)}`);
      }
    }
  }
  console.log(`== ${p} [${ks.join("+")}] ${report.length ? report.length + " notes" : "OK"}`);
  for (const r of report) console.log("   " + r);
}
