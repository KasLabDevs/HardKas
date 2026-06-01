import fs from 'node:fs';
import path from 'node:path';

const packagesDir = 'packages';
const newVersion = '0.7.9-alpha';

const directories = fs.readdirSync(packagesDir, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .map(dirent => dirent.name);

// Root package.json
const rootPkgPath = 'package.json';
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
rootPkg.version = newVersion;
fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n');

// Packages
for (const dir of directories) {
  const pkgPath = path.join(packagesDir, dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    
    if (pkg.version) {
      pkg.version = newVersion;
    }

    const depTypes = ['dependencies', 'devDependencies', 'peerDependencies'];
    for (const depType of depTypes) {
      if (pkg[depType]) {
        for (const [dep, version] of Object.entries(pkg[depType])) {
          if (dep.startsWith('@hardkas/')) {
            pkg[depType][dep] = 'workspace:*'; // pnpm replaces this on pack/publish
          }
        }
      }
    }

    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`Bumped ${pkg.name} to ${newVersion} with workspace:* deps`);
  }
}
