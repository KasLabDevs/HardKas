const fs=require('fs');
const path=require('path');

const templatesDir = 'packages/cli/templates';
let files = [];
if (fs.existsSync(templatesDir)) {
  fs.readdirSync(templatesDir).forEach(d => {
    const p = path.join(templatesDir, d, 'package.json');
    if (fs.existsSync(p)) files.push(p);
  });
}
files.push('packages/cli/dummy-project/package.json');
files.push('packages/cli/src/templates/dapp-react.ts');

files.forEach(f => {
  if(!fs.existsSync(f)) return;
  let c = fs.readFileSync(f, 'utf8');
  c = c.replace(/\"workspace:\*\"/g, '\"^0.11.6-alpha\"');
  fs.writeFileSync(f, c);
  console.log('Fixed', f);
});
