const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.git' || file === '.turbo' || file === 'dist' || file === 'dist-release' || file === '.hardkas') continue;
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else {
      // Only process text files like ts, js, json, md
      if (/\.(ts|js|json|md)$/.test(file)) {
        results.push(filePath);
      }
    }
  }
  return results;
}

const rootDir = 'c:\\Users\\jrodr\\Documents\\kaslabdevs\\GitHub\\HardKas-repo';
const files = walk(rootDir);

let modifiedCount = 0;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  // Wait, I need to make sure I don't replace "kaspasim:" where we are checking it as legacy.
  // E.g. in `packages/localnet/src/accounts.ts`, I just added support for both.
  // Or in `resolve.ts` and `real-accounts.ts` where we check `nameOrAddress.startsWith("kaspasim:")`.
  // I will skip accounts.ts, resolve.ts, real-accounts.ts from blind replacement.
  if (file.endsWith('localnet\\src\\accounts.ts') || 
      file.endsWith('accounts\\src\\resolve.ts') || 
      file.endsWith('accounts\\src\\real-accounts.ts')) {
    continue;
  }
  
  if (content.includes('kaspasim:')) {
    const newContent = content.replace(/kaspasim:/g, 'kaspa:sim_');
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated ${file}`);
    modifiedCount++;
  }
}
console.log(`Replaced in ${modifiedCount} files.`);
