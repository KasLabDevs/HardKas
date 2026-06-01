const fs = require('fs');
const path = require('path');

const ignoreDirs = ['node_modules', '.git', 'dist', 'dashboard-dist', '.turbo', 'coverage'];
const ignoreExts = ['.log', '.tgz', '.png', '.jpg', '.jpeg', '.gif', '.ico'];

let modifiedCount = 0;

function walk(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!ignoreDirs.includes(item)) {
        walk(fullPath);
      }
    } else {
      if (ignoreExts.includes(path.extname(fullPath))) continue;
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('0.7.11-alpha')) {
          const newContent = content.replace(/0\.7\.10-alpha/g, '0.7.11-alpha');
          fs.writeFileSync(fullPath, newContent, 'utf8');
          modifiedCount++;
          console.log(`Updated ${fullPath}`);
        }
      } catch (e) {
        // Ignore files that can't be read as utf8
      }
    }
  }
}

walk('.');
console.log(`Done. Modified ${modifiedCount} files.`);
