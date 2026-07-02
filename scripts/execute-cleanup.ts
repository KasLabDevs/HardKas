import fs from 'fs';
import path from 'path';

const repoRoot = process.cwd();
const dryRunData = JSON.parse(fs.readFileSync('cleanup-dry-run.json', 'utf8'));

const { A, B, C, D } = dryRunData;

const report = {
  deleted: [] as string[],
  archived: [] as string[],
  suspicious: D
};

function safeDelete(relPath: string) {
  const fullPath = path.join(repoRoot, relPath);
  if (fs.existsSync(fullPath)) {
    try {
      if (fs.statSync(fullPath).isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
      report.deleted.push(relPath);
    } catch (e) {
      console.error(`Failed to delete ${relPath}: ${e}`);
    }
  }
}

function safeArchive(relPath: string) {
  const fullPath = path.join(repoRoot, relPath);
  if (fs.existsSync(fullPath)) {
    try {
      const filename = path.basename(relPath);
      const destFolder = path.join(repoRoot, 'docs/archive/validation');
      if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });
      const destPath = path.join(destFolder, filename);
      
      if (fullPath !== destPath) {
        fs.renameSync(fullPath, destPath);
        report.archived.push(relPath);
      }
    } catch (e) {
      console.error(`Failed to archive ${relPath}: ${e}`);
    }
  }
}

console.log('Deleting Group A...');
A.forEach(safeDelete);

console.log('Deleting Group B...');
B.forEach(safeDelete);

console.log('Archiving Group C...');
C.forEach(safeArchive);

const gitignoreAdditions = `
# P68 Cleanup Additions
coverage/
playwright-report/
test-results/
*.log
*.tsbuildinfo
*.evidence.json
coverage-summary.json
*_REPORT.md
API_DEAD_ZONE_REPORT.md
FULL_ECOSYSTEM_COVERAGE_REPORT.md
PACKAGE_USAGE_MATRIX.md
PUBLIC_API_COVERAGE_MATRIX.md
SHOWCASE_EXECUTION_REPORT.md
TESTNET_SOAK_REPORT.json
.benchmark-workspace*
.smoke-workspace*
.crash-workspace*
.fuzz-workspace*
.post-release-gauntlet*
.tmp*
tmp/
temp/
`;

fs.appendFileSync(path.join(repoRoot, '.gitignore'), gitignoreAdditions); // hardkas-append-allow
fs.writeFileSync('cleanup-report-data.json', JSON.stringify(report, null, 2));

console.log('Cleanup executed successfully.');
