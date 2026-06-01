import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const packagesDir = path.join(process.cwd(), 'packages');
const smokeTestDir = path.join(process.cwd(), '..', 'smoke-test');
const tarballs = [];

const dirs = fs.readdirSync(packagesDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

for (const dir of dirs) {
  const pkgDir = path.join(packagesDir, dir);
  if (fs.existsSync(path.join(pkgDir, 'package.json'))) {
    console.log(`Packing ${dir}...`);
    try {
      // pack quietly, return filename
      const output = execSync('pnpm pack', { cwd: pkgDir, encoding: 'utf-8' });
      const lines = output.trim().split('\n');
      const tarball = lines[lines.length - 1].trim(); // last line is usually the filename
      if (tarball.endsWith('.tgz')) {
        tarballs.push(path.join(pkgDir, tarball));
      } else {
        // Find it directly
        const files = fs.readdirSync(pkgDir).filter(f => f.endsWith('.tgz'));
        if (files.length > 0) {
          tarballs.push(path.join(pkgDir, files[files.length - 1]));
        }
      }
    } catch (e) {
      console.error(`Failed to pack ${dir}`);
    }
  }
}

console.log(`Packed ${tarballs.length} packages.`);
console.log(`Installing in smoke-test...`);

try {
  execSync(`npm install ${tarballs.join(' ')}`, { cwd: smokeTestDir, stdio: 'inherit' });
  console.log(`Running smoke test...`);
  execSync(`node test.mjs`, { cwd: smokeTestDir, stdio: 'inherit' });
} catch (e) {
  console.error("Smoke test failed");
  process.exit(1);
}
