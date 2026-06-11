import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const targetName = process.argv[2] || 'HardKAS-dogfood-0.9.3';
const consumerDir = path.resolve(workspaceRoot, '..', targetName);
const tempPackDir = path.join(consumerDir, 'tmp-packaging');

if (!fs.existsSync(consumerDir)) {
  fs.mkdirSync(consumerDir, { recursive: true });
}
if (!fs.existsSync(tempPackDir)) {
  fs.mkdirSync(tempPackDir, { recursive: true });
}

console.log('1. Packing tarballs...');
const packagesDir = path.join(workspaceRoot, 'packages');
const packageFolders = fs.readdirSync(packagesDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

const tarballsToInstall = [];

for (const folder of packageFolders) {
  const pkgFolder = path.join(packagesDir, folder);
  const pkgJsonPath = path.join(pkgFolder, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) continue;
  
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  if (pkgJson.private) continue;

  console.log(`Packing ${pkgJson.name}...`);
  execSync('pnpm pack', { cwd: pkgFolder, stdio: 'ignore' });
  
  const tarballs = fs.readdirSync(pkgFolder).filter(f => f.endsWith('.tgz'));
  for (const t of tarballs) {
    const dest = path.join(tempPackDir, t);
    fs.renameSync(path.join(pkgFolder, t), dest);
    tarballsToInstall.push(dest);
  }
}

console.log('2. Setting up dogfood consumer project...');
execSync('npm init -y', { cwd: consumerDir, stdio: 'ignore' });

console.log('3. Installing tarballs...');
execSync(`npm install ${tarballsToInstall.join(' ')}`, { cwd: consumerDir, stdio: 'inherit' });

console.log(`Done! Tarballs packed and installed to ${targetName}.`);
