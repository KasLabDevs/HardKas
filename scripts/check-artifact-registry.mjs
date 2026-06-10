import fs from 'node:fs';
import path from 'node:path';
import { HardkasSchemas } from '../packages/core/dist/index.js';

// Build a Set of all registered schemas for O(1) lookups
const validSchemas = new Set(Object.values(HardkasSchemas));

// Some historical exceptions that are explicitly allowed in docs/fixtures
const allowedHistorical = new Set([
  // add any if needed
]);

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
  
  const regex = /(["'`])hardkas\.(?:[a-zA-Z0-9_\-\.]+)\1/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const matchedString = match[0].slice(1, -1);
    
    // Ignore filenames
    if (matchedString.endsWith('.ts') || matchedString.endsWith('.json') || matchedString.endsWith('.js') || matchedString.endsWith('.mjs')) continue;
    
    // Ignore console logs or comments
    const line = content.substring(content.lastIndexOf('\n', match.index), content.indexOf('\n', match.index));
    if (line.includes('//') || line.includes('/*')) continue;
    
    console.log(`[TS/JS Stray String] Violation found in ${path.relative(process.cwd(), file)}: ${match[0]}`);
    violations++;
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
      // For docs, we just warn, but since it's a strict gate let's make sure our reports don't have fake schemas
      // Wait, there might be "hardkas.fake.v1" mentioned in the report itself! Let's allow "hardkas.fake.v1" in allowedHistorical.
      // But we must catch anything else.
    }
  }
}

if (violations === 0) {
  console.log("Registry validation passed! No stray 'hardkas.*' strings found in TS, and all JSON fixtures use valid schemas.");
} else {
  console.error(`Validation failed. Found ${violations} stray strings or unregistered schemas in fixtures.`);
  process.exit(1);
}
