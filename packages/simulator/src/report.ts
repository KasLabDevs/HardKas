// SAFETY_LEVEL: RESEARCH_EXPERIMENTAL
//
// Simple text formatter for scenario results.

import type { ScenarioResult } from "./scenarios.js";

export function formatScenarioReport(results: ScenarioResult[]): string {
  let report = "═══════════════════════════════════════════════════════════\n";
  report += " GHOSTDAG Simulation Report\n";
  report += "═══════════════════════════════════════════════════════════\n\n";

  for (const res of results) {
    const m = res.metrics;
    report += `Scenario: ${res.name} (K=${res.config.k ?? 18}, ${res.config.blockCount} blocks)\n`;
    report += `  Total blocks    : ${m.totalBlocks}\n`;
    report += `  Blue / Red      : ${m.blueBlocks} / ${m.redBlocks}\n`;
    report += `  Red ratio       : ${m.redRatio.toFixed(4)}\n`;
    report += `  DAG width       : ${m.dagWidth}\n`;
    report += `  Mean parents    : ${m.meanParents.toFixed(2)}\n`;
    report += `  Selected chain  : ${m.selectedChainLength} blocks\n`;
    report += `  Max blueScore   : ${m.maxBlueScore}\n`;
    report += `  Compute time    : ${res.computeTimeMs.toFixed(0)}ms\n\n`;
  }

  return report;
}
