const fs = require('fs');
const path = require('path');

const excludeDirs = new Set(['node_modules', 'dist', '.git', '.hardkas', '.smoke-workspace', 'coverage', '.pnpm-store']);
const excludeExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.mp4', '.webm', '.pdf', '.zip', '.tgz']);

function walk(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (excludeDirs.has(file)) continue;
      const p = path.join(dir, file);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        walk(p);
      } else {
        if (excludeExts.has(path.extname(p).toLowerCase())) continue;
        try {
          const content = fs.readFileSync(p, 'utf8');
          if (content.includes('0.8.16-alpha')) {
            const newContent = content.replace(/0\.8\.15-alpha/g, '0.8.16-alpha');
            fs.writeFileSync(p, newContent, 'utf8');
            console.log('Updated: ' + p);
          }
        } catch (e) {
          // ignore binary files or unreadable files
        }
      }
    }
  } catch(e) {}
}

walk('.');
