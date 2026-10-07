// Attributes each loopback attempt the hermetic preload recorded to the test file that was running.
// The gate runs one file at a time (vitest.config.ts: fileParallelism false), so the file whose
// [startTime, endTime] window holds the attempt's timestamp made it; otherwise the last file that
// started before it (an attempt during collection/import).
// usage: node attribute-attempts.cjs <vitest.json> <hermetic-network.log> <host:port>
const fs = require("fs");
const [jsonFile, logFile, target] = process.argv.slice(2);
const strip = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const report = JSON.parse(strip(fs.readFileSync(jsonFile, "utf8")));
const files = report.testResults
  .map((t) => ({ name: t.name.replace(/\\/g, "/").replace(/^.*\/wt\//, ""), start: t.startTime, end: t.endTime }))
  .filter((f) => Number.isFinite(f.start))
  .sort((a, b) => a.start - b.start);
const out = {};
for (const line of fs.readFileSync(logFile, "utf8").split(/\r?\n/)) {
  if (!line.includes(target)) continue;
  const [ts, kind, , pid] = line.split("\t");
  const t = Date.parse(ts);
  const inside = files.find((f) => t >= f.start && t <= f.end);
  const before = [...files].reverse().find((f) => f.start <= t);
  const who = inside ? inside.name : before ? `${before.name} (after its start, outside its window)` : "(before any file)";
  (out[who] ??= []).push(`${ts} ${kind} ${pid}`);
}
console.log(JSON.stringify(out, null, 2));
