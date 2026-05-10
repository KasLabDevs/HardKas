import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const packagesDir = path.join(rootDir, 'packages');

const rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));

const commonMetadata = {
  license: rootPkg.license,
  author: rootPkg.author,
  repository: {
    type: rootPkg.repository.type,
    url: rootPkg.repository.url
  },
  bugs: rootPkg.bugs,
  homepage: rootPkg.homepage
};

const packages = fs.readdirSync(packagesDir).filter(f => fs.statSync(path.join(packagesDir, f)).isDirectory());

for (const pkgName of packages) {
  const pkgPath = path.join(packagesDir, pkgName, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    
    // Update metadata
    pkg.license = commonMetadata.license;
    pkg.author = commonMetadata.author;
    pkg.repository = {
      ...commonMetadata.repository,
      directory: `packages/${pkgName}`
    };
    pkg.bugs = commonMetadata.bugs;
    pkg.homepage = `https://github.com/jrodrg92/Hardkas/tree/main/packages/${pkgName}#readme`;
    
    // Ensure files include LICENSE and README.md
    if (!pkg.files) pkg.files = ["dist"];
    if (!pkg.files.includes("LICENSE")) pkg.files.push("LICENSE");
    if (!pkg.files.includes("README.md")) pkg.files.push("README.md");

    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
    console.log(`Updated ${pkgName}/package.json`);
  }
}
