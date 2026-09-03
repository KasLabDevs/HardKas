import fs from "fs/promises";
import path from "path";
import { ExecutionContext } from "./types.js";

export async function writeFinalReport(ctx: ExecutionContext): Promise<void> {
  const reportDir = path.join(ctx.options.reportDir, ctx.manifest.runId);
  await fs.mkdir(reportDir, { recursive: true });

  const m = ctx.manifest;

  // Counts
  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;
  let envNotQualifiedCount = 0;
  let blockedCount = 0;
  
  const resultsList = Object.values(m.results);
  
  for (const res of resultsList) {
    if (!res.mandatory || !res.implemented) continue; // Only count implemented mandatory
    switch (res.status) {
      case "PASS": passCount++; break;
      case "FAIL": failCount++; break;
      case "SKIPPED": skipCount++; break;
      case "ENVIRONMENT_NOT_QUALIFIED": envNotQualifiedCount++; break;
      case "BLOCKED_BY_PREVIOUS_FAILURE": blockedCount++; break;
    }
  }

  const report = `
# HardKAS Public npm Qualification

Version: ${m.hardkasVersion}
Package source: ${m.packageSource}
Run ID: ${m.runId}

## Environment
- OS: ${m.os} ${m.osVersion} (${m.arch})
- Node: ${m.nodeVersion}
- npm: ${m.npmVersion}
- pnpm: ${m.pnpmVersion || "N/A"}
- Docker kaspad image ID: ${m.kaspadImageId || "N/A"}
- Docker container ID: ${m.containerId || "N/A"}
- Consumer Path: ${m.consumerPath}

## Results
PASS: ${passCount}
FAIL: ${failCount}
SKIPPED: ${skipCount}
ENVIRONMENT_NOT_QUALIFIED: ${envNotQualifiedCount}
BLOCKED: ${blockedCount}

## Gate Details
${resultsList.map(res => `- [${res.status}] Gate ${res.id}: ${res.name} (Implemented: ${res.implemented}, Mandatory: ${res.mandatory})`).join("\n")}

## Final Decision
${m.decision}
`;

  await fs.writeFile(path.join(reportDir, "summary.md"), report, "utf-8");
  await fs.writeFile(path.join(reportDir, "manifest.json"), JSON.stringify(m, null, 2), "utf-8");
}
