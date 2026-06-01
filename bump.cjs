const fs = require('fs');
const dirs = ['packages', 'apps', 'examples'];
const files = ['package.json'];
for (const dir of dirs) {
  if (fs.existsSync(dir)) {
    const subdirs = fs.readdirSync(dir);
    for (const subdir of subdirs) {
      files.push(`${dir}/${subdir}/package.json`);
    }
  }
}
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  let t = fs.readFileSync(f, 'utf8');
  t = t.replace(/"version":\s*"[^"]+"/, '"version": "0.7.11-alpha"');
  fs.writeFileSync(f, t);
}
