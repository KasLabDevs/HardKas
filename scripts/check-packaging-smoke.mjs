import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

console.log("=== PHASE 10: PACKAGING SMOKE ===");

const workspaceRoot = process.cwd();
const tempPackDir = path.join(workspaceRoot, "tmp-packaging");
const tempConsumerDir = path.join(workspaceRoot, "tmp-consumer-hardkas");

function run(cmd, cwd = workspaceRoot) {
  console.log(`> ${cmd} (in ${cwd})`);
  return execSync(cmd, { cwd, encoding: "utf8", stdio: "pipe" });
}

try {
  // 1. Pack tarballs
  console.log("\\n1. Packing tarballs...");
  if (fs.existsSync(tempPackDir)) fs.rmSync(tempPackDir, { recursive: true, force: true });
  fs.mkdirSync(tempPackDir, { recursive: true });

  const packagesDir = path.join(workspaceRoot, "packages");
  const packageFolders = fs.readdirSync(packagesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  let packedCount = 0;

  for (const folder of packageFolders) {
    const pkgFolder = path.join(packagesDir, folder);
    const pkgJsonPath = path.join(pkgFolder, "package.json");
    
    if (!fs.existsSync(pkgJsonPath)) continue;
    
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    if (pkgJson.private) continue; // Skip private packages

    // Clean up old tarballs first
    const oldTarballs = fs.readdirSync(pkgFolder).filter(f => f.endsWith(".tgz"));
    for (const t of oldTarballs) {
      fs.rmSync(path.join(pkgFolder, t));
    }

    console.log(`Packing ${pkgJson.name}...`);
    // We use pnpm pack inside the package folder so that workspace:* is stripped
    run(`pnpm pack`, pkgFolder);
    
    // Move the created tarball to tempPackDir
    const tarballs = fs.readdirSync(pkgFolder).filter(f => f.endsWith(".tgz"));
    for (const t of tarballs) {
      fs.renameSync(path.join(pkgFolder, t), path.join(tempPackDir, t));
      packedCount++;
    }
  }

  console.log(`Successfully packed ${packedCount} tarballs.`);

  // 2. Setup external consumer
  console.log("\\n2. Setting up external consumer...");
  if (fs.existsSync(tempConsumerDir)) fs.rmSync(tempConsumerDir, { recursive: true, force: true });
  fs.mkdirSync(tempConsumerDir, { recursive: true });
  run(`npm init -y`, tempConsumerDir);

  // 3. Install tarballs
  console.log("\\n3. Installing tarballs in consumer project...");
  const tarballFiles = fs.readdirSync(tempPackDir).map(f => path.resolve(tempPackDir, f));
  // We use npm install on the tarballs directly
  run(`npm install ${tarballFiles.join(" ")}`, tempConsumerDir);

  // 4. Verify no workspace leaks
  console.log("\\n4. Verifying no workspace:* leaks...");
  const packageLock = JSON.parse(fs.readFileSync(path.join(tempConsumerDir, "package-lock.json"), "utf8"));
  const lockStr = JSON.stringify(packageLock);
  if (lockStr.includes("workspace:*")) {
    throw new Error("workspace:* leak detected in packaged dependencies!");
  }

  // 5. CLI Smoke Test
  console.log("\\n5. Running CLI smoke tests...");
  const versionOut = run(`npx hardkas --version`, tempConsumerDir).trim();
  console.log(`Version output: ${versionOut}`);
  if (!versionOut.includes("0.9.2-alpha")) {
    throw new Error(`CLI version mismatch. Expected 0.9.2-alpha, got ${versionOut}`);
  }

  const capabilitiesOut = run(`npx hardkas capabilities --json`, tempConsumerDir);
  const capJson = JSON.parse(capabilitiesOut);
  if (!capJson.capabilities) throw new Error("Missing capabilities in JSON output");

  // 6. SDK Smoke Test
  console.log("\\n6. Running SDK smoke tests...");
  const consumerScript = path.join(tempConsumerDir, "smoke.mjs");
  fs.writeFileSync(consumerScript, `
import { HARDKAS_VERSION } from "@hardkas/sdk";
import { HardkasSchemas as CoreSchemas } from "@hardkas/core";
import { HardkasSchemas as ArtifactSchemas } from "@hardkas/artifacts";

console.log("SDK Version:", HARDKAS_VERSION);
console.log("Core Schema TxPlan:", CoreSchemas.TxPlan);
console.log("Artifact Schema TxPlan:", ArtifactSchemas.TxPlan);

if (HARDKAS_VERSION !== "0.9.2-alpha") throw new Error("SDK version mismatch");
if (!CoreSchemas.TxPlan) throw new Error("CoreSchemas missing");
if (!ArtifactSchemas.TxPlan) throw new Error("ArtifactSchemas missing");
`);

  run(`node smoke.mjs`, tempConsumerDir);

  console.log("\\n=== PACKAGING SMOKE PASS ===");
  process.exit(0);
} catch (e) {
  console.error("\\n=== PACKAGING SMOKE FAILED ===");
  if (e.stdout) console.error("STDOUT:", e.stdout);
  if (e.stderr) console.error("STDERR:", e.stderr);
  console.error(e.message);
  process.exit(1);
} finally {
  if (fs.existsSync(tempPackDir)) fs.rmSync(tempPackDir, { recursive: true, force: true });
  if (fs.existsSync(tempConsumerDir)) fs.rmSync(tempConsumerDir, { recursive: true, force: true });
}
