import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HardkasSchemas } from '../packages/core/dist/index.js';

// Build a Set of all registered schemas for O(1) lookups
const validSchemas = new Set(Object.values(HardkasSchemas));

// Some historical exceptions or test-fixture strings that are explicitly allowed
const allowedHistorical = new Set([
  'hardkas.invalid.v999', // qualification negative test
  'hardkas.tx.plan.v1',   // qualification schema test
  'hardkas.cmd'          // command wrapper fixture
]);

// RC1 · R3: `hardkas.*` strings that are NOT artifact schemas, each allowed only in the file that owns it and with its
// reason. They stay out of HardkasSchemas on purpose: that registry lists what HardKAS writes and validates as
// artifacts, and none of these is ever an artifact's `schema`.
const allowedNonSchema = new Map([
  ['hardkas.zk.groth16.bn254.vkFingerprint.v1', {
    file: 'packages/sdk/src/zk/groth16-verifier.ts',
    reason: 'domain-separation tag hashed into the Groth16 verification-key fingerprint (CA-ZK-04); renaming it changes every fingerprint, and ZK is frozen'
  }],
  ['hardkas.merchantCompat.v3', {
    file: 'scripts/run-merchant-compatibility-battery-evidence.mjs',
    reason: 'schema of the results file written by this report script; no package reads it'
  }],
  ['hardkas.merchantCompat.output.v1', {
    file: 'scripts/run-merchant-compatibility-battery-evidence.mjs',
    reason: 'schema of the output file written by the same report script; no package reads it'
  }]
]);

function isAllowedNonSchema(value, file) {
  const entry = allowedNonSchema.get(value);
  return entry !== undefined && path.relative(process.cwd(), file).split(path.sep).join('/') === entry.file;
}

function findFiles(dir, filter, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === '.git' || file === 'dist' || file.startsWith('.')) continue;
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findFiles(filePath, filter, fileList);
    } else if (filter.test(filePath)) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const tsDirs = [
  path.join(process.cwd(), 'packages', 'artifacts', 'src'),
  path.join(process.cwd(), 'packages', 'sdk', 'src'),
  path.join(process.cwd(), 'packages', 'cli', 'src'),
  path.join(process.cwd(), 'packages', 'core', 'src'),
  path.join(process.cwd(), 'packages', 'query-store', 'src'),
  path.join(process.cwd(), 'scripts')
];

const jsonDirs = [
  path.join(process.cwd(), 'fixtures'),
  path.join(process.cwd(), 'examples'),
  path.join(process.cwd(), 'packages', 'cli', 'templates'),
  // any generated reports in root
  process.cwd()
];

let tsFiles = [];
for (const dir of tsDirs) {
  tsFiles = tsFiles.concat(findFiles(dir, /\.(ts|tsx|js|mjs|cjs)$/));
}

let jsonFiles = [];
for (const dir of jsonDirs) {
  if (dir === process.cwd()) {
    // Only add .json files in root directly
    const rootFiles = fs.readdirSync(process.cwd());
    for (const f of rootFiles) {
      if (f.endsWith('.json') && !f.startsWith('.')) {
        jsonFiles.push(path.join(process.cwd(), f));
      }
    }
  } else {
    jsonFiles = jsonFiles.concat(findFiles(dir, /\.json$/));
  }
}

let violations = 0;

// 1. Check TS files for strays
for (const file of tsFiles) {
  const content = fs.readFileSync(file, 'utf8');
  
  if (file.endsWith('registry.ts') || file.endsWith('constants.ts') || file.includes('scratch') || file.includes('test')) continue;
  // this checker's own allow lists name the strings they allow
  if (path.resolve(file) === path.resolve(fileURLToPath(import.meta.url))) continue;
  
  const regex = /(["'`])hardkas\.(?:[a-zA-Z0-9_\-\.]+)\1/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const matchedString = match[0].slice(1, -1);
    
    // Ignore filenames
    if (matchedString.endsWith('.ts') || matchedString.endsWith('.json') || matchedString.endsWith('.js') || matchedString.endsWith('.mjs')) continue;
    
    // Ignore console logs or comments
    const line = content.substring(content.lastIndexOf('\n', match.index), content.indexOf('\n', match.index));
    if (line.includes('//') || line.includes('/*')) continue;
    
    if (!validSchemas.has(matchedString) && !allowedHistorical.has(matchedString) && !isAllowedNonSchema(matchedString, file)) {
      console.log(`[TS/JS Stray String] Violation found in ${path.relative(process.cwd(), file)}: ${match[0]}`);
      violations++;
    }
  }
}

// 2. Check JSON files (Fixtures, Examples, Docs)
for (const file of jsonFiles) {
  if (file.includes('package.json') || file.includes('tsconfig.json') || file.includes('turbo.json')) continue;
  
  const content = fs.readFileSync(file, 'utf8');
  const regex = /(["'`])hardkas\.(?:[a-zA-Z0-9_\-\.]+)\1/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const matchedString = match[0].slice(1, -1);
    
    // Ignore filenames
    if (matchedString.endsWith('.ts') || matchedString.endsWith('.json') || matchedString.endsWith('.js') || matchedString.endsWith('.mjs')) continue;
    
    if (!validSchemas.has(matchedString) && !allowedHistorical.has(matchedString)) {
      console.log(`[JSON Fixture/Doc Invalid Schema] Violation found in ${path.relative(process.cwd(), file)}: ${match[0]}`);
      violations++;
    }
  }
}

// 3. Check Markdown (Docs)
const mdFiles = findFiles(process.cwd(), /\.md$/).filter(f => !f.includes('scratch') && !f.includes('.gemini') && !f.includes('node_modules'));
for (const file of mdFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const regex = /(["'`])hardkas\.(?:[a-zA-Z0-9_\-\.]+)\1/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const matchedString = match[0].slice(1, -1);
    if (matchedString.endsWith('.ts') || matchedString.endsWith('.json') || matchedString.endsWith('.js') || matchedString.endsWith('.mjs')) continue;
    
    if (!validSchemas.has(matchedString) && !allowedHistorical.has(matchedString)) {
      // In docs, notify if an unregistered schema is referenced
    }
  }
}

for (const [value, { file, reason }] of allowedNonSchema) {
  console.log(`[allowed, not a schema] ${value} in ${file}: ${reason}`);
}

if (violations === 0) {
  console.log("Registry validation passed! No stray 'hardkas.*' strings found in TS, and all JSON fixtures use valid schemas.");
} else {
  console.error(`Validation failed. Found ${violations} stray strings or unregistered schemas in fixtures.`);
  process.exit(1);
}
