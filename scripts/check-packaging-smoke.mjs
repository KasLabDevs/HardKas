import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

console.log("=== PHASE 10: PACKAGING SMOKE ===");

const workspaceRoot = process.cwd();
// The release version is the root manifest's (never a literal here).
const releaseVersion = JSON.parse(fs.readFileSync(path.join(workspaceRoot, "package.json"), "utf8")).version;
const tempPackDir = path.join(workspaceRoot, "tmp-packaging");
const tempConsumerDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-smoke-consumer-"));

/** The entry names of an npm tarball (gzip + ustar), without extracting anything to disk. */
function tarballEntries(tgz) {
  const tar = zlib.gunzipSync(tgz);
  const names = [];
  for (let off = 0; off + 512 <= tar.length; ) {
    const header = tar.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start, len) => header.subarray(start, start + len).toString("utf8").replace(/\0.*$/s, "");
    const prefix = field(345, 155);
    names.push((prefix ? `${prefix}/${field(0, 100)}` : field(0, 100)).replace(/^\.\//, ""));
    const size = parseInt(field(124, 12).trim() || "0", 8);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return names;
}

function run(cmd, cwd = workspaceRoot) {
  console.log(`> ${cmd} (in ${cwd})`);
  return execSync(cmd, { cwd, encoding: "utf8", stdio: "pipe" });
}

try {
  // 1. Pack tarballs
  console.log("\n1. Packing tarballs...");
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

  // 2. Setup external consumer in isolated temporary directory
  console.log("\n2. Setting up external consumer in isolated temporary directory...");
  fs.writeFileSync(path.join(tempConsumerDir, "hardkas.config.mjs"), "export default {};\n");
  run(`npm init -y`, tempConsumerDir);

  // 3. Install tarballs
  console.log("\n3. Installing tarballs in consumer project...");
  const tarballFiles = fs.readdirSync(tempPackDir).map(f => path.resolve(tempPackDir, f));
  // We use npm install on the tarballs directly
  run(`npm install ${tarballFiles.join(" ")}`, tempConsumerDir);

  // 4. Verify no workspace leaks
  console.log("\n4. Verifying no workspace:* leaks...");
  const packageLock = JSON.parse(fs.readFileSync(path.join(tempConsumerDir, "package-lock.json"), "utf8"));
  const lockStr = JSON.stringify(packageLock);
  if (lockStr.includes("workspace:*")) {
    throw new Error("workspace:* leak detected in packaged dependencies!");
  }

  // 5. CLI Smoke Test
  console.log("\n5. Running CLI smoke tests...");
  const versionOut = run(`npx hardkas --version`, tempConsumerDir).trim();
  console.log(`Version output: ${versionOut}`);
  if (!versionOut.includes(releaseVersion)) {
    throw new Error(`CLI version mismatch. Expected ${releaseVersion}, got ${versionOut}`);
  }

  const capabilitiesOut = run(`npx hardkas capabilities --json`, tempConsumerDir);
  const capJson = JSON.parse(capabilitiesOut);
  if (!capJson.capabilities) throw new Error("Missing capabilities in JSON output");

  // 5b. L1-CORE-1 B5: @hardkas/ext-l2 and @hardkas/pskt-native are private (not published), so they are not packed and
  // the consumer has neither. INT9: @hardkas/l2 is private too (owner policy, provisional). Surface audit 2026-11-09: so
  // are the 8 packages without a consumer (docs/status/versioning.md, "Not published"). The CLI must report the l2
  // extension as not installed, not fail.
  console.log("\n5b. Checking that the private packages were not packed and the CLI works without them...");
  const packed = fs.readdirSync(tempPackDir);
  for (const privatePkg of [
    "hardkas-ext-l2-",
    "hardkas-pskt-native-",
    "hardkas-l2-",
    "hardkas-client-",
    "hardkas-react-",
    "hardkas-wallet-adapter-",
    "hardkas-simulator-adapters-",
    "hardkas-plugin-local-indexer-",
    "hardkas-plugin-rpc-backend-",
    "hardkas-sync-daemon-",
    "hardkas-storage-postgres-"
  ]) {
    if (packed.some((f) => f.startsWith(privatePkg))) throw new Error(`${privatePkg}*.tgz was packed but the package is private`);
  }
  // INT9: every published tarball carries its README.md and LICENSE (B5 found 20 of 31 without a README).
  for (const t of packed) {
    const entries = tarballEntries(fs.readFileSync(path.join(tempPackDir, t)));
    for (const required of ["package/README.md", "package/LICENSE", "package/package.json"]) {
      if (!entries.includes(required)) throw new Error(`${t} has no ${required}`);
    }
  }
  console.log(`Every one of the ${packed.length} tarballs carries README.md and LICENSE.`);
  const extListOut = run(`npx hardkas extension list --json`, tempConsumerDir);
  const extListJson = JSON.parse(extListOut);
  const l2Ext = extListJson.result?.extensions?.find(e => e.id === "l2");
  if (l2Ext && l2Ext.status !== "not_installed") throw new Error(`Extension 'l2' expected status 'not_installed', got '${l2Ext.status}'`);
  console.log(`Extension 'l2': ${l2Ext ? l2Ext.status : "not listed"} (not published).`);

  // 6. SDK module smoke test
  console.log("\n6. Running SDK module smoke tests...");
  const consumerScript = path.join(tempConsumerDir, "smoke.mjs");
  const zkFixture = path.join(workspaceRoot, "fixtures", "toccata-v2", "zk", "groth16-multiplier");
  fs.writeFileSync(consumerScript, `
import { HARDKAS_VERSION, pskt, verifyZkProofMath } from "@hardkas/sdk";
import { HardkasSchemas as CoreSchemas } from "@hardkas/core";
import { HardkasSchemas as ArtifactSchemas } from "@hardkas/artifacts";

console.log("SDK Version:", HARDKAS_VERSION);
console.log("Core Schema TxPlan:", CoreSchemas.TxPlan);
console.log("Artifact Schema TxPlan:", ArtifactSchemas.TxPlan);

if (HARDKAS_VERSION !== ${JSON.stringify(releaseVersion)}) throw new Error("SDK version mismatch");
if (!CoreSchemas.TxPlan) throw new Error("CoreSchemas missing");
if (!ArtifactSchemas.TxPlan) throw new Error("ArtifactSchemas missing");

// L1-CORE-1 B5: without @hardkas/pskt-native the native PSKT adapter is unavailable, and the SDK still imports.
if (await pskt.registerNativeAdapter()) throw new Error("the native PSKT adapter registered without @hardkas/pskt-native");
// L1-CORE-1 B5: snarkjs is an optional peer and is not installed here: the pairing is an engine error, typed.
const zk = await verifyZkProofMath(${JSON.stringify(zkFixture)}, ${JSON.stringify(workspaceRoot)}, { allowWeakVerificationKey: true });
console.log("ZK without snarkjs:", zk.status, zk.issues.map((i) => i.code).join(","));
if (zk.status !== "ZK_GROTH16_VERIFIER_ERROR" || zk.verified || !zk.issues.some((i) => i.code === "ZK_ENGINE_UNAVAILABLE")) {
  throw new Error("expected ZK_GROTH16_VERIFIER_ERROR with ZK_ENGINE_UNAVAILABLE without snarkjs");
}
`);

  run(`node smoke.mjs`, tempConsumerDir);

  console.log("\n=== PACKAGING SMOKE PASS ===");
  process.exit(0);
} catch (e) {
  console.error("\n=== PACKAGING SMOKE FAILED ===");
  if (e.stdout) console.error("STDOUT:", e.stdout);
  if (e.stderr) console.error("STDERR:", e.stderr);
  console.error(e.message);
  process.exit(1);
} finally {
  if (fs.existsSync(tempPackDir)) fs.rmSync(tempPackDir, { recursive: true, force: true });
  if (fs.existsSync(tempConsumerDir)) fs.rmSync(tempConsumerDir, { recursive: true, force: true });
}
