import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * No shell in the SilverScript paths: the files that start silverc (packages/core/src/silverscript.ts), the SilverScript
 * runner and VM debugger (silverscript-runner.ts, silverscript-vm-debugger.ts), the staged executables they start
 * (staged-executable.ts), and the CLI commands and runners of `hardkas silver`. Every process start must be execFile /
 * spawn with an argument array and no shell.
 *
 * C-9 (audit 2026-11-13): the list named one existing file; the others (and a directory `runners/silver` that is not
 * one) were missing and silently skipped, while the real process starts were in packages/core. Now every listed file
 * must exist and every listed pattern must match at least one file, or the gate fails. Extra paths (root-relative or
 * absolute) can be given as arguments; they must exist too.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

/** Files that must exist and are scanned. */
const filesToCheck = [
  'packages/core/src/silverscript.ts', // starts the pinned silverc (execFile)
  'packages/core/src/silverscript-runner.ts', // starts the SilverScript runner (execFile)
  'packages/core/src/silverscript-vm-debugger.ts', // starts the VM debugger (spawn / execFile)
  'packages/core/src/staged-executable.ts', // the private copies those processes are started from
  'packages/cli/src/commands/silver.ts',
  'packages/cli/src/commands/silver-dev-framework.ts'
];

/** Patterns (directory + file prefix + suffix) that must match at least one file each; every match is scanned. */
const patternsToCheck = [
  { dir: 'packages/core/src', prefix: 'silverscript', suffix: '.ts' },
  { dir: 'packages/cli/src/runners', prefix: 'silver-', suffix: '.ts' },
  { dir: 'packages/cli/src/commands', prefix: 'silver', suffix: '.ts' }
];

const CHILD_PROCESS = String.raw`["'](?:node:)?child_process["']`;
const forbiddenPatterns = [
  // a call of exec / execSync (a RegExp's `.exec(` is not one: it follows a dot)
  { regex: /(?<![\w.$])execSync\s*\(/, reason: 'Unsafe execSync() usage. Use execFileSync with args array and shell: false.' },
  { regex: /(?<![\w.$])exec\s*\(/, reason: 'Unsafe exec() usage. Use execFile with args array and shell: false.' },
  { regex: /child_process\.exec(?:Sync)?\b/, reason: 'child_process.exec is forbidden.' },
  // importing them at all (named import, destructured require or dynamic import)
  { regex: new RegExp(String.raw`import\s*\{[^}]*\bexec(?:Sync)?\b(?!File)[^}]*\}\s*from\s*` + CHILD_PROCESS), reason: 'Importing exec/execSync from child_process is forbidden.' },
  { regex: new RegExp(String.raw`\{[^}]*\bexec(?:Sync)?\b(?!File)[^}]*\}\s*=\s*(?:await\s+)?(?:require|import)\s*\(\s*` + CHILD_PROCESS), reason: 'Importing exec/execSync from child_process is forbidden.' },
  { regex: /shell:\s*(?:true|["'`])/, reason: 'A shell option is forbidden in SilverScript paths to prevent RCE.' },
  { regex: /python -c/, reason: 'External python execution is forbidden. Use native Node libraries.' },
  { regex: /pyCmd/, reason: 'pyCmd external string command detected.' }
];

let failed = false;
let scanned = 0;
const fail = (message) => {
  console.error(`[FAIL] ${message}`);
  failed = true;
};

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  scanned++;
  // a namespace or default import of child_process: its exec / execSync members are forbidden too
  const namespaces = [...content.matchAll(new RegExp(String.raw`import\s+(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s+from\s+` + CHILD_PROCESS, 'g'))].map((m) => m[1]);
  const patterns = [
    ...forbiddenPatterns,
    ...namespaces.map((ns) => ({ regex: new RegExp(String.raw`\b${ns}\.exec(?:Sync)?\s*\(`), reason: `${ns}.exec/execSync (child_process) is forbidden.` }))
  ];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    // comments (line and block) are not code
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
    for (const pattern of patterns) {
      if (pattern.regex.test(line)) {
        fail(`${filePath}:${i + 1}`);
        console.error(`       Found forbidden pattern: ${pattern.regex}`);
        console.error(`       Reason: ${pattern.reason}`);
        console.error(`       Line: ${t}\n`);
      }
    }
  }
}

const targets = new Set();
for (const p of [...filesToCheck, ...process.argv.slice(2)]) {
  const full = path.resolve(rootDir, p);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    fail(`${p}: listed for the scan but not a file (renamed or moved? update scripts/check-silver-no-shell-exec.mjs)`);
    continue;
  }
  targets.add(full);
}
for (const { dir, prefix, suffix } of patternsToCheck) {
  const full = path.join(rootDir, dir);
  const matches = fs.existsSync(full) ? fs.readdirSync(full).filter((f) => f.startsWith(prefix) && f.endsWith(suffix)) : [];
  if (matches.length === 0) {
    fail(`${dir}/${prefix}*${suffix}: no file matches (renamed or moved? update scripts/check-silver-no-shell-exec.mjs)`);
    continue;
  }
  for (const f of matches) targets.add(path.join(full, f));
}
for (const f of [...targets].sort()) scanFile(f);

if (failed) {
  console.error('SILVERSCRIPT_SECURITY_SCAN_FAILED');
  process.exit(1);
} else {
  console.log(`SILVERSCRIPT_SECURITY_SCAN_PASSED (${scanned} files)`);
}
