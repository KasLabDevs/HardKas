import fs from 'node:fs';
import path from 'node:path';

const searchStr = '0.7.7-alpha';
const replaceStr = '0.7.7-alpha';

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'dist', '.turbo', 'npm-smoke-test-run', '.hardkas'].includes(entry.name)) {
        walk(fullPath);
      }
    } else {
      if (entry.name.endsWith('.tgz') || entry.name.endsWith('.png') || entry.name.endsWith('.jpg')) continue;
      // Skip changelog and release notes
      if (entry.name === 'CHANGELOG.md' || entry.name.toLowerCase().includes('release')) continue;
      
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes(searchStr)) {
          const newContent = content.split(searchStr).join(replaceStr);
          fs.writeFileSync(fullPath, newContent, 'utf8');
          console.log(`Updated: ${fullPath}`);
        }
      } catch (e) {
        // ignore binary files or read errors
      }
    }
  }
}

walk(process.cwd());
console.log("Done.");
