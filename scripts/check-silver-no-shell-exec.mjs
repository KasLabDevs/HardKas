import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const pathsToCheck = [
  'packages/cli/src/commands/silver.ts',
  'packages/cli/src/commands/silver-discovery.ts',
  'packages/cli/src/commands/silver-lifecycle.ts',
  'packages/cli/src/commands/silver-simulate.ts',
  'packages/cli/src/runners/silver'
];

const forbiddenPatterns = [
  { regex: /execSync\(/, reason: 'Unsafe execSync() usage. Use execFileSync with args array and shell: false.' },
  { regex: /exec\(/, reason: 'Unsafe exec() usage. Use execFile with args array and shell: false.' },
  { regex: /shell:\s*true/, reason: 'shell: true is forbidden in SilverScript paths to prevent RCE.' },
  { regex: /child_process\.exec\b/, reason: 'child_process.exec is forbidden.' },
  { regex: /python -c/, reason: 'External python execution is forbidden. Use native Node libraries.' },
  { regex: /pyCmd/, reason: 'pyCmd external string command detected.' }
];

let failed = false;

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const f of files) {
    const fullPath = path.join(dir, f.name);
    if (f.isDirectory()) {
      scanDir(fullPath);
    } else if (f.isFile() && (f.name.endsWith('.ts') || f.name.endsWith('.js') || f.name.endsWith('.mjs'))) {
      scanFile(fullPath);
    }
  }
}

function scanFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip imports or comments
    if (line.trim().startsWith('//')) continue;
    if (line.includes('import {') && line.includes('execSync')) continue;

    for (const pattern of forbiddenPatterns) {
      if (pattern.regex.test(line)) {
        console.error(`[FAIL] ${filePath}:${i + 1}`);
        console.error(`       Found forbidden pattern: ${pattern.regex}`);
        console.error(`       Reason: ${pattern.reason}`);
        console.error(`       Line: ${line.trim()}\n`);
        failed = true;
      }
    }
  }
}

for (const p of pathsToCheck) {
  const full = path.join(rootDir, p);
  if (fs.existsSync(full)) {
    if (fs.statSync(full).isDirectory()) {
      scanDir(full);
    } else {
      scanFile(full);
    }
  } else {
    // Some might be wildcard directories or not exist yet, ignore gracefully.
    const dir = path.dirname(full);
    if (fs.existsSync(dir)) {
        const base = path.basename(full);
        if (base.includes('*')) {
            const prefix = base.replace('*', '');
            const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix) && (f.endsWith('.ts') || f.endsWith('.js')));
            for (const f of files) scanFile(path.join(dir, f));
        }
    }
  }
}

if (failed) {
  console.error('SILVERSCRIPT_SECURITY_SCAN_FAILED');
  process.exit(1);
} else {
  console.log('SILVERSCRIPT_SECURITY_SCAN_PASSED');
}
