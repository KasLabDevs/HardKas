import fs from 'node:fs';
import path from 'node:path';

const oldVersion = '0.7.9-alpha';
const newVersion = '0.7.9-alpha';

const filesToUpdate = [
  'packages/artifacts/src/constants.ts',
  'apps/dashboard/package.json',
  'apps/dashboard/src/components/Sidebar.tsx',
  'SECURITY.md',
  'RUNTIME_SEMANTICS.md',
  'docs/RUNTIME_CONTRACT.md'
];

for (const f of filesToUpdate) {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf-8');
    content = content.replaceAll(oldVersion, newVersion);
    fs.writeFileSync(f, content);
    console.log(`Updated ${f}`);
  }
}

// Update examples package.json
const examplesDir = 'examples';
if (fs.existsSync(examplesDir)) {
  const dirs = fs.readdirSync(examplesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const dir of dirs) {
    const pkgPath = path.join(examplesDir, dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      let content = fs.readFileSync(pkgPath, 'utf-8');
      content = content.replaceAll(oldVersion, newVersion);
      fs.writeFileSync(pkgPath, content);
      console.log(`Updated ${pkgPath}`);
    }

    const artifactsDir = path.join(examplesDir, dir, 'artifacts');
    if (fs.existsSync(artifactsDir)) {
      const artifacts = fs.readdirSync(artifactsDir, { recursive: true, withFileTypes: true })
        .filter(f => f.isFile() && f.name.endsWith('.json'));
      for (const artifact of artifacts) {
        const artifactPath = path.join(artifact.parentPath || artifact.path, artifact.name);
        let content = fs.readFileSync(artifactPath, 'utf-8');
        content = content.replaceAll(oldVersion, newVersion);
        fs.writeFileSync(artifactPath, content);
        console.log(`Updated ${artifactPath}`);
      }
    }
  }
}
