import fs from 'fs';
import path from 'path';

const packagesDir = path.resolve('./packages');
const dirs = fs.readdirSync(packagesDir);

for (const dir of dirs) {
  const pkgPath = path.join(packagesDir, dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    let changed = false;

    if (pkg.main !== './dist/index.js') {
      pkg.main = './dist/index.js';
      changed = true;
    }
    if (pkg.types !== './dist/index.d.ts') {
      pkg.types = './dist/index.d.ts';
      changed = true;
    }

    if (!pkg.exports) {
      pkg.exports = {};
      changed = true;
    }

    // Preserve existing exports but overwrite "."
    const dotExport = pkg.exports['.'] || {};
    pkg.exports['.'] = {
      types: './dist/index.d.ts',
      import: './dist/index.js',
      default: './dist/index.js'
    };
    changed = true;

    if (changed) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      console.log(`Updated exports for @hardkas/${dir}`);
    }
  }
}
