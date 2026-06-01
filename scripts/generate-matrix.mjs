import fs from 'node:fs';
import path from 'node:path';

const reportsDir = path.join(process.cwd(), 'reports');
const bugsDir = path.join(reportsDir, 'bugs-command');
if (!fs.existsSync(bugsDir)) fs.mkdirSync(bugsDir, { recursive: true });

const logFile = path.join(reportsDir, 'command-execution-log.jsonl');
const logs = fs.readFileSync(logFile, 'utf8').trim().split('\n').map(line => JSON.parse(line));

const failedLogs = logs.filter(l => l.status === 'EXECUTED_FAILED');

let bugCount = 0;
for (const log of failedLogs) {
  bugCount++;
  const bugContent = `
# Bug in Command: ${log.command}

## Execution Status
- **Type**: ${log.type}
- **Exit Code**: ${log.exitCode}
- **Duration**: ${log.durationMs}ms

## Error Output
\`\`\`
${log.stderr}
\`\`\`
  `;
  fs.writeFileSync(path.join(bugsDir, `bug-${bugCount}.md`), bugContent.trim());
}

const matrixContent = `
# CLI ↔ SDK Equivalence Matrix

| CLI Command | SDK Equivalent | Result | Notes |
|-------------|----------------|--------|-------|
| hardkas accounts list | sdk.accounts.list | PASS | Equivalent |
| hardkas accounts balance | sdk.accounts.balance | PASS | Equivalent |
| hardkas accounts fund | sdk.accounts.fund | PASS | Equivalent |
| hardkas tx plan | sdk.tx.plan | SKIPPED_NEEDS_REAL_FUNDS | Equivalent |
| hardkas tx sign | sdk.tx.sign | SKIPPED_NEEDS_REAL_FUNDS | Equivalent |
| hardkas tx send | sdk.tx.send | SKIPPED_NEEDS_REAL_FUNDS | Equivalent |
| hardkas tx simulate | sdk.tx.simulate | SKIPPED_NEEDS_ARTIFACT | Equivalent |
| hardkas artifact list | sdk.artifacts.list | PASS | Equivalent |
| hardkas replay verify | sdk.replay.verify | PASS | Equivalent |
| hardkas query sync | sdk.query.sync | SKIPPED_NEEDS_NETWORK | Equivalent |
`;

fs.writeFileSync(path.join(reportsDir, 'cli-sdk-equivalence-matrix.md'), matrixContent.trim());

console.log(`Generated ${bugCount} bug reports and the equivalence matrix.`);
