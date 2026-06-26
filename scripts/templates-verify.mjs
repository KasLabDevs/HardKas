import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import url from "node:url";
import os from "node:os";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const templatesDir = path.join(repoRoot, "packages/cli/templates");

const templates = ["payment-app", "batch-payments", "local-indexer"];

console.log("=== P17 Ecosystem Templates Gauntlet ===");

let allPassed = true;

for (const template of templates) {
  console.log(`\n--- Verifying template: ${template} ---`);
  const tmpDir = path.join(os.tmpdir(), `hardkas-template-test-${template}-${Date.now()}`);
  
  try {
    console.log(`1. Creating project in ${tmpDir}`);
    // We run the CLI directly from source using tsx to ensure we test current changes
    execSync(`pnpm exec tsx packages/cli/src/index.ts create ${template} ${tmpDir}`, {
      cwd: repoRoot,
      stdio: "inherit"
    });

    console.log(`2. Injecting local workspace dependencies into ${tmpDir}`);
    const pkgPath = path.join(tmpDir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    
    // Replace "latest" with absolute local paths for CI verification
    if (pkg.dependencies && pkg.dependencies["@hardkas/sdk"]) {
      pkg.dependencies["@hardkas/sdk"] = `file:${path.join(repoRoot, "packages/sdk")}`;
    }
    if (pkg.devDependencies && pkg.devDependencies["@hardkas/testing"]) {
      pkg.devDependencies["@hardkas/testing"] = `file:${path.join(repoRoot, "packages/testing")}`;
    }
    
    // Always inject the local CLI to ensure npx hardkas uses our local build
    pkg.devDependencies = pkg.devDependencies || {};
    pkg.devDependencies["@hardkas/cli"] = `file:${path.join(repoRoot, "packages/cli")}`;
    // Also inject artifacts and core as they might be transitive deps needed by CLI locally
    pkg.devDependencies["@hardkas/artifacts"] = `file:${path.join(repoRoot, "packages/artifacts")}`;
    pkg.devDependencies["@hardkas/core"] = `file:${path.join(repoRoot, "packages/core")}`;
    
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    console.log(`3. Installing dependencies in ${tmpDir}`);
    execSync(`npm install`, { cwd: tmpDir, stdio: "inherit" });

    console.log(`4. Running npx hardkas test --evidence`);
    execSync(`npx hardkas test --evidence`, { cwd: tmpDir, stdio: "inherit" });

    // Find the generated evidence file
    const rootFiles = fs.readdirSync(tmpDir);
    const hkeFile = rootFiles.find(f => f.endsWith(".hke.json"));
    
    if (!hkeFile) {
      throw new Error("No .hke.json evidence package was generated!");
    }

    console.log(`5. Verifying evidence package: ${hkeFile}`);
    execSync(`npx hardkas evidence verify ${hkeFile}`, { cwd: tmpDir, stdio: "inherit" });

    // Check for forbidden claims (e.g. mainnet)
    const evidencePath = path.join(tmpDir, hkeFile);
    const evidenceContent = fs.readFileSync(evidencePath, "utf-8");
    if (evidenceContent.includes('"network": "mainnet"')) {
      throw new Error("Forbidden claim detected: template generated mainnet artifacts.");
    }

    console.log(`[PASS] ${template} verified successfully.`);
  } catch (err) {
    console.error(`\n[FAIL] Template verification failed for ${template}`);
    console.error(err);
    allPassed = false;
  }
}

if (!allPassed) {
  console.error("\n❌ TEMPLATES_VERIFY_FAILED: One or more templates failed the gauntlet.");
  process.exit(1);
} else {
  console.log("\n✅ TEMPLATES_VERIFY_PASS: All templates successfully verified!");
}
