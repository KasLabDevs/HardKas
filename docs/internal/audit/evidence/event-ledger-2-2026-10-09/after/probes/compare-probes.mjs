// Side by side: the investigation's probes-1 (BEFORE, rc.27 content) and the AFTER runs of the same probes + the extra ones.
// usage: node compare-probes.mjs <before.results.json> <after-p.results.json> <after-x.results.json>
import fs from "node:fs";
const [before, afterP, afterX] = process.argv.slice(2).map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
const byId = (r) => Object.fromEntries(r.results.map((x) => [x.id, x]));
const b = byId(before);
const a = byId(afterP);
console.log(`BEFORE head ${before.head.slice(0, 9)} (${before.at})  ·  AFTER head ${afterP.head.slice(0, 9)} (${afterP.at}); network: non-loopback refused BEFORE ${before.network.refused.filter((x) => !/LOOPBACK_PORT/.test(x)).length}, AFTER ${afterP.network.refused.filter((x) => !/LOOPBACK_PORT/.test(x)).length}\n`);
for (const id of Object.keys(a)) {
  console.log(`=== ${id}`);
  console.log(`  BEFORE [${b[id]?.verdict}${b[id]?.sev ? ` ${b[id].sev}` : ""}] ${b[id]?.why ?? "(not run)"}`);
  console.log(`  AFTER  [${a[id].verdict}${a[id].sev ? ` ${a[id].sev}` : ""}] ${a[id].why}`);
}
console.log(`\n=== extra AFTER probes (head ${afterX.head.slice(0, 9)}; non-loopback refused ${afterX.network.refused.filter((x) => !/LOOPBACK_PORT/.test(x)).length})`);
for (const r of afterX.results) console.log(`  ${r.id} [${r.verdict}${r.sev ? ` ${r.sev}` : ""}] ${r.why}`);
