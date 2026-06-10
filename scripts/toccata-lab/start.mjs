import { execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Version Selection ──────────────────────────────────────────────
// v2.0.0: Mainnet Toccata Release. Supports --testnet (TN10), --simnet, --devnet.
//         Does NOT support --netsuffix=12 (TN12 was dropped).
// v1.3.0-toc.5: Legacy pre-release. Supports --testnet=12 (TN12).
//         Kept as explicit fallback via --legacy-toc5 flag.
const args = process.argv.slice(2);
const buildFromSource = args.includes("--build-from-source");
const useLegacy = args.includes("--legacy-toc5");
const useTestnet = args.includes("--testnet");

const TOCCATA_VERSION = useLegacy ? "v1.3.0-toc.5" : "v2.0.0";
const TOCCATA_IMAGE = `kaspanet/rusty-kaspad:${TOCCATA_VERSION}`;

// Network selection:
// - v2.0.0 default: --simnet (isolated local lab, no external peers)
// - v2.0.0 --testnet: --testnet (TN10, connects to public testnet)
// - v1.3.0-toc.5: --testnet --netsuffix=12 (TN12)
let NETWORK_LABEL;
let KASPAD_NETWORK_ARGS;
let RPC_PORT = "16210";
let WRPC_JSON_PORT = "18210";

if (useLegacy) {
  NETWORK_LABEL = "testnet-12 (legacy v1.3.0-toc.5)";
  KASPAD_NETWORK_ARGS = ["--testnet", "--netsuffix=12"];
} else if (useTestnet) {
  NETWORK_LABEL = "testnet-10 (v2.0.0)";
  KASPAD_NETWORK_ARGS = ["--testnet"];
} else {
  NETWORK_LABEL = "simnet (v2.0.0 isolated)";
  KASPAD_NETWORK_ARGS = ["--simnet", "--enable-unsynced-mining"];
}

console.log("\x1b[1m\n============================================================\x1b[0m");
console.log(`\x1b[1m Toccata Lab Bootstrap — rusty-kaspa ${TOCCATA_VERSION} \x1b[0m`);
console.log(`\x1b[1m Network: ${NETWORK_LABEL} \x1b[0m`);
console.log("\x1b[1m============================================================\n\x1b[0m");

if (!useLegacy) {
  console.log("\x1b[33m⚠ TOCCATA_MAINNET_RELEASE_DETECTED\x1b[0m");
  console.log("\x1b[2m  rusty-kaspa v2.0.0 is the Mainnet Toccata Release.\x1b[0m");
  console.log("\x1b[2m  TN12 (--netsuffix=12) is no longer supported in this version.\x1b[0m");
  console.log("\x1b[2m  HardKAS SilverScript lifecycle remains limited to testnet/simnet.\x1b[0m");
  console.log("\x1b[31m  SILVERSCRIPT_MAINNET_NOT_ENABLED\x1b[0m\n");
}

function commandExists(cmd) {
  try {
    if (process.platform === "win32") {
      execSync(`where ${cmd}`, { stdio: "ignore" });
    } else {
      execSync(`which ${cmd}`, { stdio: "ignore" });
    }
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!buildFromSource) {
    console.log(`[1] Attempting to use Docker image: \x1b[36m${TOCCATA_IMAGE}\x1b[0m`);
    
    if (!commandExists("docker")) {
      console.log(`  \x1b[31m❌\x1b[0m Docker is not installed or not in PATH.`);
      console.log(`  \x1b[31mTOCCATA_LAB_BLOCKED\x1b[0m`);
      process.exit(1);
    }

    try {
      console.log(`  \x1b[2mPulling image...\x1b[0m`);
      execSync(`docker pull ${TOCCATA_IMAGE}`, { stdio: "inherit" });
      console.log(`  \x1b[32m✅\x1b[0m Image pulled successfully.`);
      
      // Probe: verify the network args are accepted
      try {
        execSync(`docker run --rm ${TOCCATA_IMAGE} kaspad ${KASPAD_NETWORK_ARGS.join(" ")} --version`, { stdio: "pipe" });
      } catch (err) {
        const out = (err.stdout?.toString() || "") + (err.stderr?.toString() || "");
        if (out.includes("not supported") || (out.includes("unexpected value") && out.includes("--testnet"))) {
          console.log(`  \x1b[31m❌\x1b[0m Network args [${KASPAD_NETWORK_ARGS.join(" ")}] are not supported by this image.`);
          console.log(`  \x1b[31mTOCCATA_NETWORK_FLAG_UNSUPPORTED\x1b[0m`);
          console.log(`  \x1b[31mTOCCATA_LAB_BLOCKED\x1b[0m`);
          process.exit(1);
        }
        // Non-fatal: --version exits with 0 on some builds, error on others
      }

      console.log(`[2] Starting Toccata Node on ${NETWORK_LABEL}...`);
      
      const dockerArgs = [
        "run", "--rm", "-d",
        "-p", `${RPC_PORT}:${RPC_PORT}`,
        "-p", `${WRPC_JSON_PORT}:${WRPC_JSON_PORT}`,
        TOCCATA_IMAGE,
        "kaspad", ...KASPAD_NETWORK_ARGS,
        "--utxoindex",
        `--rpclisten=0.0.0.0:${RPC_PORT}`,
        `--rpclisten-json=0.0.0.0:${WRPC_JSON_PORT}`
      ];
      
      const res = execSync(`docker ${dockerArgs.join(" ")}`).toString().trim();
      console.log(`  \x1b[32m✅\x1b[0m Container started: ${res.substring(0, 12)}`);
      console.log(`  \x1b[32mTOCCATA_NODE_READY\x1b[0m`);
      console.log(`  \x1b[2mRPC (gRPC): ws://127.0.0.1:${RPC_PORT}\x1b[0m`);
      console.log(`  \x1b[2mRPC (wRPC/JSON): ws://127.0.0.1:${WRPC_JSON_PORT}\x1b[0m`);
      console.log(`  \x1b[32mTOCCATA_LAB_READY\x1b[0m`);
      return;
    } catch (err) {
      console.log(`  \x1b[31m❌\x1b[0m Failed to pull Docker image.`);
      console.log(`  \x1b[31mTOCCATA_DOCKER_IMAGE_UNAVAILABLE\x1b[0m`);
      console.log(`  \x1b[31mTOCCATA_LAB_BLOCKED\x1b[0m`);
      console.log(`\x1b[2m\nHint: Use --build-from-source to compile from the github tag locally.\x1b[0m`);
      process.exit(1);
    }
  } else {
    console.log(`[1] Building rusty-kaspa from source (tag: \x1b[36m${TOCCATA_VERSION}\x1b[0m)`);
    
    if (!commandExists("git")) {
      console.log(`  \x1b[31m❌\x1b[0m git not found.`);
      console.log(`  \x1b[31mTOCCATA_SOURCE_BUILD_FAILED\x1b[0m`);
      process.exit(1);
    }
    
    if (!commandExists("cargo")) {
      console.log(`  \x1b[31m❌\x1b[0m cargo not found. Rust toolchain is required.`);
      console.log(`  \x1b[31mTOCCATA_SOURCE_BUILD_FAILED\x1b[0m`);
      process.exit(1);
    }

    const workDir = path.join(process.cwd(), ".hardkas", "toccata-lab-src");
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    const repoDir = path.join(workDir, "rusty-kaspa");
    if (!fs.existsSync(repoDir)) {
      console.log(`  \x1b[2mCloning kaspanet/rusty-kaspa...\x1b[0m`);
      try {
        execSync(`git clone https://github.com/kaspanet/rusty-kaspa.git ${repoDir}`, { stdio: "inherit" });
      } catch (e) {
        console.log(`  \x1b[31m❌\x1b[0m Failed to clone repo.`);
        console.log(`  \x1b[31mTOCCATA_SOURCE_BUILD_FAILED\x1b[0m`);
        process.exit(1);
      }
    }

    try {
      console.log(`  \x1b[2mChecking out ${TOCCATA_VERSION}...\x1b[0m`);
      execSync(`git checkout ${TOCCATA_VERSION}`, { cwd: repoDir, stdio: "inherit" });
      
      console.log(`  \x1b[2mBuilding cargo project (this will take a while)...\x1b[0m`);
      execSync(`cargo build --release --bin kaspad`, { cwd: repoDir, stdio: "inherit" });
      
      console.log(`  \x1b[32m✅\x1b[0m Build successful.`);
      
      console.log(`[2] Starting node on ${NETWORK_LABEL}...`);
      const kaspadPath = path.join(repoDir, "target", "release", "kaspad");
      
      const child = spawn(kaspadPath, [...KASPAD_NETWORK_ARGS, "--utxoindex"], { stdio: "pipe" });
      
      child.stderr.on("data", (data) => {
        const out = data.toString();
        if (out.includes("not supported") || out.includes("error: Found argument")) {
          console.log(`  \x1b[31m❌\x1b[0m Network flags not supported by this binary.`);
          console.log(`  \x1b[31mTOCCATA_NETWORK_FLAG_UNSUPPORTED\x1b[0m`);
          child.kill();
          process.exit(1);
        }
      });
      
      console.log(`  \x1b[32m✅\x1b[0m Process spawned.`);
      console.log(`  \x1b[32mTOCCATA_NODE_READY\x1b[0m`);
      console.log(`  \x1b[32mTOCCATA_LAB_READY\x1b[0m`);
    } catch (e) {
      console.log(`  \x1b[31m❌\x1b[0m Build or start failed.`);
      console.log(`  \x1b[31mTOCCATA_SOURCE_BUILD_FAILED\x1b[0m`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
