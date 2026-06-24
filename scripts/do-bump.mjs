import fs from "node:fs";
import path from "node:path";

const SEARCH = "0.9.7-alpha";
const REPLACE = "0.9.7-alpha";

const explicitFiles = [
  "lerna.json",
  "package.json",
  "packages/core/src/migrations.ts",
  "packages/core/src/snapshot.ts",
  "packages/cli/src/broadcast-guard.ts",
  "packages/cli/src/commands/init.ts",
  "packages/cli/src/runners/dag-runners.ts",
  "packages/cli/src/runners/l2-tx-runners.ts",
  "packages/cli/src/runners/semantic-verify-runner.ts",
  "packages/cli/src/runners/tx-profile-runner.ts",
  "packages/cli/test/broadcast-guard.test.ts",
  "packages/cli/test/examples-acceptance.node.ts",
  "packages/l2/src/bridge.ts",
  "packages/localnet/src/dag.ts"
];

function replaceInFile(filePath) {
  try {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) return;
    const content = fs.readFileSync(fullPath, "utf8");
    if (content.includes(SEARCH)) {
      fs.writeFileSync(fullPath, content.replaceAll(SEARCH, REPLACE), "utf8");
      console.log(`Updated: ${filePath}`);
    }
  } catch(e) {
    console.error(`Error updating ${filePath}:`, e.message);
  }
}

// 1. Explicit files
for (const f of explicitFiles) {
  replaceInFile(f);
}

// 2. package.json in packages
const packagesDir = path.resolve("packages");
const packages = fs.readdirSync(packagesDir);
for (const pkg of packages) {
  const pkgDir = path.join(packagesDir, pkg);
  if (fs.statSync(pkgDir).isDirectory()) {
    const pJson = path.join(pkgDir, "package.json");
    replaceInFile(pJson);
    
    // Some dummy projects might be inside
    const dummyPJson = path.join(pkgDir, "dummy-project", "package.json");
    if (fs.existsSync(dummyPJson)) replaceInFile(dummyPJson);
  }
}

console.log("Bump script finished.");
