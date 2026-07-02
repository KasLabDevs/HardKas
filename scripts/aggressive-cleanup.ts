import fs from 'fs';
import path from 'path';

const repoRoot = process.cwd();

// 1. Root Cleanup
const keepRootFiles = new Set([
  'README.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'vitest.config.ts',
  'hardkas.config.ts',
  '.gitignore',
  '.prettierrc',
  'cleanup-report-data.json',
  'cleanup-dry-run.json'
]);

const keepRootDirs = new Set([
  'packages',
  'docs',
  'examples',
  'fixtures',
  'scripts',
  'templates',
  'apps',
  'labs',
  'benchmarks',
  '.git'
]);

const rootItems = fs.readdirSync(repoRoot, { withFileTypes: true });

for (const item of rootItems) {
  const fullPath = path.join(repoRoot, item.name);
  if (item.isDirectory()) {
    if (!keepRootDirs.has(item.name)) {
      console.log(`Deleting root dir: ${item.name}`);
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  } else {
    // Check if it matches tsconfig*.json
    const isTsConfig = item.name.startsWith('tsconfig') && item.name.endsWith('.json');
    if (!keepRootFiles.has(item.name) && !isTsConfig) {
      console.log(`Deleting root file: ${item.name}`);
      fs.unlinkSync(fullPath);
    }
  }
}

// 2. Delete reports/
const reportsPath = path.join(repoRoot, 'reports');
if (fs.existsSync(reportsPath)) {
  console.log('Deleting reports/ directory');
  fs.rmSync(reportsPath, { recursive: true, force: true });
}

// 3. Deduplicate examples/
const examplesToKeep = new Set([
  '01-hello-kaspa',
  '02-basic-transfer',
  '03-localnet-demo',
  '04-trace-and-replay',
  '05-snapshot-restore',
  '06-rpc-node-health',
  'showcase-suite',
  'reference-apps'
]);

const examplesPath = path.join(repoRoot, 'examples');
if (fs.existsSync(examplesPath)) {
  const exampleItems = fs.readdirSync(examplesPath, { withFileTypes: true });
  for (const item of exampleItems) {
    if (item.isDirectory() && !examplesToKeep.has(item.name)) {
      console.log(`Deleting legacy example: ${item.name}`);
      fs.rmSync(path.join(examplesPath, item.name), { recursive: true, force: true });
    }
  }
}

console.log('Aggressive root cleanup completed.');
