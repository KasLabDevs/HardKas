import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workDir = path.resolve(__dirname, "../../.hardkas/silverscript-lab");

console.log("\x1b[1m\n==========================================\x1b[0m");
console.log("\x1b[1m SilverScript Compiler Native Builder     \x1b[0m");
console.log("\x1b[1m==========================================\n\x1b[0m");

if (!fs.existsSync(workDir)) {
  fs.mkdirSync(workDir, { recursive: true });
}

function commandExists(cmd) {
  try {
    execSync(`where ${cmd}`, { stdio: "ignore" });
    return true;
  } catch (e) {
    try {
      execSync(`which ${cmd}`, { stdio: "ignore" });
      return true;
    } catch (e2) {
      return false;
    }
  }
}

async function main() {
  if (!commandExists("git")) {
    console.log(`  \x1b[31m❌\x1b[0m git not found.`);
    console.log(`  \x1b[31mSILVERSCRIPT_BUILD_FAILED\x1b[0m`);
    process.exit(1);
  }

  // The process running this might not have the updated PATH if cargo was just installed.
  // We check if cargo is in PATH, or if it exists in the default ~/.cargo/bin directory.
  let cargoCmd = "cargo";
  if (!commandExists("cargo")) {
    const defaultCargoPath = path.join(process.env.USERPROFILE || "", ".cargo", "bin", "cargo.exe");
    if (fs.existsSync(defaultCargoPath)) {
      cargoCmd = `"${defaultCargoPath}"`;
    } else {
      console.log(`  \x1b[31m❌\x1b[0m cargo not found. Rust toolchain is required.`);
      console.log(`  \x1b[31mSILVERSCRIPT_BUILD_FAILED\x1b[0m`);
      process.exit(1);
    }
  }

  const repoDir = path.join(workDir, "silverscript");
  
  if (!fs.existsSync(repoDir)) {
    console.log(`  \x1b[2mCloning kaspanet/silverscript...\x1b[0m`);
    try {
      execSync(`git clone https://github.com/kaspanet/silverscript.git ${repoDir}`, { stdio: "inherit" });
    } catch (e) {
      console.log(`  \x1b[31m❌\x1b[0m Failed to clone repo.`);
      console.log(`  \x1b[31mSILVERSCRIPT_BUILD_FAILED\x1b[0m`);
      process.exit(1);
    }
  } else {
    console.log(`  \x1b[2mSilverscript repo already cloned. Pulling latest...\x1b[0m`);
    execSync(`git pull`, { cwd: repoDir, stdio: "ignore" });
  }

  console.log(`  \x1b[2mBuilding silverscript compiler natively with cargo...\x1b[0m`);
  try {
    execSync(`${cargoCmd} build --release`, { cwd: repoDir, stdio: "inherit" });
  } catch (e) {
    console.log(`  \x1b[31m❌\x1b[0m Failed to compile silverscript.`);
    console.log(`  \x1b[31mSILVERSCRIPT_BUILD_FAILED\x1b[0m`);
    process.exit(1);
  }

  const binaryPath = path.join(repoDir, "target", "release", "silverc.exe");
  const linuxBinaryPath = path.join(repoDir, "target", "release", "silverc");
  
  let targetBinary = binaryPath;
  if (!fs.existsSync(targetBinary)) {
      if (fs.existsSync(linuxBinaryPath)) {
          targetBinary = linuxBinaryPath;
      } else {
          console.log(`  \x1b[31m❌\x1b[0m Compiled binary not found at expected location.`);
          console.log(`  \x1b[31mSILVERSCRIPT_BUILD_FAILED\x1b[0m`);
          process.exit(1);
      }
  }

  // Copy to a known path so HardKAS can find it reliably without relying on PATH
  const binDir = path.resolve(__dirname, "../../.hardkas/bin");
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const destPath = path.join(binDir, path.basename(targetBinary));
  fs.copyFileSync(targetBinary, destPath);

  console.log(`  \x1b[32m✅\x1b[0m Build successful.`);
  console.log(`  \x1b[32m✅\x1b[0m Binary installed to: ${destPath}`);
  console.log(`  \x1b[32mSILVERSCRIPT_COMPILER_READY\x1b[0m`);
}

main().catch(console.error);
