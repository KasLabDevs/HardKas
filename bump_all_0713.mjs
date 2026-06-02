import fs from 'node:fs';
import path from 'node:path';

const ignoreDirs = ['node_modules', '.git', 'dist', 'dist-release', '.turbo', 'coverage', 'generated-apps', 'scratch'];
const ignoreExts = ['.log', '.tgz', '.png', '.jpg', '.jpeg', '.gif', '.ico'];

let modifiedCount = 0;

function walk(dir) {
  let items;
  try {
    items = fs.readdirSync(dir);
  } catch (e) {
    return;
  }
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    let stat;
    try { stat = fs.statSync(fullPath); } catch(e) { continue; }
    
    if (stat.isDirectory()) {
      if (!ignoreDirs.includes(item) && !item.startsWith('.nightmare') && !item.startsWith('.sandbox')) {
        walk(fullPath);
      }
    } else {
      if (ignoreExts.includes(path.extname(fullPath))) continue;
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('0.7.13-alpha')) {
          const newContent = content.split('0.7.13-alpha').join('0.7.13-alpha');
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
