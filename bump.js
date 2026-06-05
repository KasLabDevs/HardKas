import fs from 'fs';
import path from 'path';

const TARGET_DIRS = [
  'apps',
  'packages',
  'examples',
  'docs'
];

const ROOT_FILES = [
  'RUNTIME_CONTRACT.md',
  'RUNTIME_SEMANTICS.md',
  'SECURITY.md',
  'package.json',
  'hardkas.config.ts'
];

function bumpFile(fullPath) {
  try {
    let content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes('0.8.14-alpha')) {
      content = content.replace(/0\.8\.14-alpha/g, '0.8.15-alpha');
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log('Bumped:', fullPath);
    }
  } catch(e) {}
}

function walk(dir) {
  let files = [];
  try { files = fs.readdirSync(dir); } catch(e) { return; }
  for (const file of files) {
    if (['node_modules', '.git', 'dist', '.hardkas', '.pnpm-store', 'artifacts'].includes(file)) continue;
    const fullPath = path.join(dir, file);
    let stat;
    try { stat = fs.lstatSync(fullPath); } catch(e) { continue; }
    if (stat.isSymbolicLink()) continue;
    
    if (stat.isDirectory()) {
      walk(fullPath);
    } else if (['.ts', '.tsx', '.json', '.md', '.html'].includes(path.extname(fullPath))) {
      bumpFile(fullPath);
    }
  }
}

for (const dir of TARGET_DIRS) {
  walk(path.join(process.cwd(), dir));
}

for (const file of ROOT_FILES) {
  bumpFile(path.join(process.cwd(), file));
}
console.log("Done.");
