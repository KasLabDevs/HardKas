import fs from 'node:fs';
import path from 'node:path';

const oldVer = '0.11.4-alpha';
const newVer = '0.11.4-alpha';
let count = 0;

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === 'dist' || file === '.turbo' || file === '.git' || file === 'tmp' || file.startsWith('.tmp')) continue;
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      walk(full);
    } else {
      if (full.endsWith('.json') || full.endsWith('.ts') || full.endsWith('.mjs') || full.endsWith('.md')) {
        let content = fs.readFileSync(full, 'utf8');
        if (content.includes(oldVer)) {
          fs.writeFileSync(full, content.replaceAll(oldVer, newVer), 'utf8');
          console.log('Bumped:', full);
          count++;
        }
      }
    }
  }
}

walk(process.cwd());
console.log(`Bumped version in ${count} files.`);
