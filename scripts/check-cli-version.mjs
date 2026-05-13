import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const cliPkgPath = path.join(rootDir, "packages", "cli", "package.json");
const artifactsPkgPath = path.join(rootDir, "packages", "artifacts", "package.json");
const artifactsConstantsPath = path.join(rootDir, "packages", "artifacts", "src", "constants.ts");

// 1. Read CLI package version
const cliPkg = JSON.parse(readFileSync(cliPkgPath, "utf8"));
const expectedVersion = cliPkg.version;

console.log(`Checking CLI version synchronization...`);
console.log(`Expected version (from cli/package.json): ${expectedVersion}`);

// 2. Check CLI output
try {
  const output = execFileSync("node", ["--import", "tsx", "packages/cli/src/index.ts", "--version"], {

    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "--no-warnings" },
    shell: false
  }).trim();

  if (output !== expectedVersion) {
    console.error(`❌ CLI output version mismatch!`);
    console.error(`   Output:  "${output}"`);
    console.error(`   Package: "${expectedVersion}"`);
    process.exit(1);
  }
  console.log(`✅ CLI output version matches package.json`);
} catch (err) {
  console.error(`❌ Failed to execute CLI --version:`, err.message);
  process.exit(1);
}

// 3. Check artifacts package version
const artifactsPkg = JSON.parse(readFileSync(artifactsPkgPath, "utf8"));
if (artifactsPkg.version !== expectedVersion) {
  console.error(`❌ Artifacts package version mismatch!`);
  console.error(`   Artifacts: "${artifactsPkg.version}"`);
  console.error(`   Expected:  "${expectedVersion}"`);
  process.exit(1);
}
console.log(`✅ Artifacts package version matches CLI`);

// 4. Check artifacts hardcoded constant
if (existsSync(artifactsConstantsPath)) {
  const constantsContent = readFileSync(artifactsConstantsPath, "utf8");
  const versionMatch = constantsContent.match(/HARDKAS_VERSION = "([^"]+)"/);
  if (versionMatch) {
    const hardcodedVersion = versionMatch[1];
    if (hardcodedVersion !== expectedVersion) {
      console.error(`❌ Artifacts hardcoded HARDKAS_VERSION mismatch!`);
      console.error(`   Hardcoded: "${hardcodedVersion}"`);
      console.error(`   Expected:  "${expectedVersion}"`);
      process.exit(1);
    }
    console.log(`✅ Artifacts hardcoded version matches package.json`);
  } else {
    console.warn(`⚠️ Could not find HARDKAS_VERSION constant in artifacts/src/constants.ts`);
  }
}

console.log(`\n✨ All version checks passed!`);
