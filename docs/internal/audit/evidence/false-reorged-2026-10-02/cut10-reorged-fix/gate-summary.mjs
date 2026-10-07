// Summary of a vitest JSON report (recreated 2-oct: wave0/gate-summary.mjs was removed from %TEMP%).
// usage: node gate-summary.mjs <report.json>
import { readFileSync } from "node:fs";
const r = JSON.parse(readFileSync(process.argv[2], "utf8"));
console.log(`success=${r.success} files=${r.numTotalTestSuites} tests=${r.numTotalTests} passed=${r.numPassedTests} failed=${r.numFailedTests} pending=${r.numPendingTests} failedSuites=${r.numFailedTestSuites}`);
const failedFiles = r.testResults.filter((t) => t.status !== "passed");
console.log(`\nFAILED FILES (${failedFiles.length}):`);
for (const t of failedFiles) {
  const name = t.name.replace(/\\/g, "/");
  const failing = t.assertionResults.filter((a) => a.status === "failed");
  console.log(`\n- ${name}  [${t.status}] tests=${t.assertionResults.length} failed=${failing.length}`);
  if (t.message) console.log(`   file-level: ${String(t.message).split("\n")[0].slice(0, 300)}`);
  for (const a of failing.slice(0, 6)) {
    const msg = (a.failureMessages?.[0] ?? "").split("\n")[0].slice(0, 300);
    console.log(`   x ${a.fullName.slice(0, 120)} :: ${msg}`);
  }
}
