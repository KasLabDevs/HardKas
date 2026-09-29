// Which test files of a vitest JSON report were running at the given local times?
// usage: node files-at.mjs <report.json> <HH:MM:SS> [...]
import { readFileSync } from "node:fs";
const r = JSON.parse(readFileSync(process.argv[2], "utf8"));
const day = new Date(r.startTime);
for (const hms of process.argv.slice(3)) {
  const [h, m, s] = hms.split(":").map(Number);
  const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, s).getTime();
  const hits = r.testResults.filter((f) => f.startTime - 2000 <= t && t <= f.endTime + 2000);
  console.log(`${hms}: ${hits.map((f) => `${f.name.replace(/\\/g, "/").replace(/^.*?packages\//, "packages/")} [${new Date(f.startTime).toLocaleTimeString("es-ES")}–${new Date(f.endTime).toLocaleTimeString("es-ES")}, ${f.assertionResults.length} tests, ${f.assertionResults.filter((a) => a.status === "skipped" || a.status === "pending").length} skipped]`).join(" | ") || "(none)"}`);
}
