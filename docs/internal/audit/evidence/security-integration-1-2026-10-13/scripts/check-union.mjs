// SECURITY-INTEGRATION-1: si must be the union of the three waves (read-only on the wave trees). The path list of each
// wave is its published manifest patch; a path changed by one wave only must be byte-identical to that wave's working
// tree file; a path changed by several waves is listed for manual review.
import fs from "node:fs";
import { execSync } from "node:child_process";
const S = "C:/Users/jrodr/AppData/Local/Temp/claude/C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo/ecaf7e92-a2ba-49b0-aafc-c62b4cb5eda0/scratchpad/l1-reality-1";
const waves = {
  nni: ["C:/Users/jrodr/hkl1/nni/src", `${S}/nni/manifest-m2/node-network-identity-1.patch`],
  ea: ["C:/Users/jrodr/hkl1/ea/src", `${S}/ea/manifest-m1/endpoint-authority-1.patch`],
  mg: ["C:/Users/jrodr/hkl1/mg/src", `${S}/mg/manifest-m1/sdk-mainnet-broadcast-guard-1.patch`]
};
const SI = "C:/Users/jrodr/hkl1/si/src";
const owners = new Map();
for (const [k, [, patch]] of Object.entries(waves)) {
  const out = execSync(`git apply --numstat -z "${patch}"`, { encoding: "utf8", maxBuffer: 1 << 28 });
  const paths = out.split("\0").filter(Boolean).map((r) => r.split("\t").pop()).filter(Boolean);
  for (const p of paths) owners.set(p, [...(owners.get(p) ?? []), k]);
  console.log(`${k}: ${paths.length} paths`);
}
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p) : null);
let mismatch = 0;
const shared = [];
for (const [p, ks] of owners) {
  if (ks.length > 1) { shared.push(`${p} [${ks.join("+")}]`); continue; }
  const a = read(`${SI}/${p}`), b = read(`${waves[ks[0]][0]}/${p}`);
  const same = a === null || b === null ? a === b : a.equals(b) || a.toString("latin1").replace(/\r\n/g, "\n") === b.toString("latin1").replace(/\r\n/g, "\n");
  if (!same) { mismatch++; console.log(`DIFF ${p} (only ${ks[0]})`); }
}
console.log(`single-owner paths ${owners.size - shared.length}, mismatches ${mismatch}`);
console.log(`shared (${shared.length}):\n  ` + shared.join("\n  "));
