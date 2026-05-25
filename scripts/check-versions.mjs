import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Read root package.json
const rootPkgPath = path.join(rootDir, "package.json");
const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
const expectedVersion = rootPkg.version;

console.log(`Checking version synchronization across workspace...`);
console.log(`Expected version (from root package.json): ${expectedVersion}`);

let hasErrors = false;

// We use pnpm to get the list of all workspace packages
let workspaces;
try {
  const output = execSync("pnpm ls -r --depth -1 --json", { cwd: rootDir, encoding: "utf8" });
  workspaces = JSON.parse(output);
} catch (e) {
  console.error("Failed to list workspaces with pnpm", e);
  process.exit(1);
}

for (const workspace of workspaces) {
  if (workspace.path === rootDir) continue; // Skip root as we already read it

  const pkgPath = path.join(workspace.path, "package.json");
  if (!existsSync(pkgPath)) continue;

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (pkg.version && pkg.version !== expectedVersion) {
    console.error(`❌ Version mismatch in ${workspace.name} (${path.relative(rootDir, workspace.path)})`);
    console.error(`   Found:    "${pkg.version}"`);
    console.error(`   Expected: "${expectedVersion}"`);
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error(`\n❌ Version synchronization failed. All workspace packages must match the root version.`);
  process.exit(1);
}

console.log(`\n✨ All workspace packages match version ${expectedVersion}!`);
