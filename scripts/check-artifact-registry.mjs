import fs from 'node:fs';
import path from 'node:path';

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

const targetDirs = [
  path.join(process.cwd(), 'packages', 'artifacts', 'src'),
  path.join(process.cwd(), 'packages', 'sdk', 'src'),
  path.join(process.cwd(), 'packages', 'cli', 'src'),
  path.join(process.cwd(), 'packages', 'core', 'src'),
  path.join(process.cwd(), 'packages', 'query-store', 'src'),
  path.join(process.cwd(), 'scripts')
];

let filesToProcess = [];
for (const dir of targetDirs) {
  filesToProcess = filesToProcess.concat(findFiles(dir, /\.(ts|tsx|js|mjs|cjs)$/));
}

let violations = 0;

for (const file of filesToProcess) {
  const content = fs.readFileSync(file, 'utf8');
  
  // Exclude registry.ts itself and the tests where we literally test string behavior
  if (file.endsWith('registry.ts') || file.endsWith('constants.ts') || file.includes('scratch') || file.includes('test')) continue;
  
  const regex = /(["'`])hardkas\.(?:[a-zA-Z0-9_\-\.]+)\1/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match[0].endsWith('.ts"') || match[0].endsWith('.ts\'') || match[0].endsWith('.ts`') || match[0].endsWith('.json"') || match[0].endsWith('.json\'') || match[0].endsWith('.json`')) continue;
    // Ignore console logs or strings that are just identifiers
    const line = content.substring(content.lastIndexOf('\n', match.index), content.indexOf('\n', match.index));
    if (line.includes('//') || line.includes('/*')) continue;
    console.log(`Violation found in ${path.relative(process.cwd(), file)}: ${match[0]}`);
    violations++;
  }
}

if (violations === 0) {
  console.log("Registry validation passed! No stray 'hardkas.*' strings found.");
} else {
  console.error(`Validation failed. Found ${violations} stray strings.`);
  process.exit(1);
}
