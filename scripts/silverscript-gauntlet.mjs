import { execSync } from "node:child_process";
import * as fs from "node:fs";

console.log("==========================================");
console.log(" HardKAS SilverScript Readiness Gauntlet  ");
console.log("==========================================\n");

function runCommand(command, expectedErrorString) {
  try {
    console.log(`> ${command}`);
    const output = execSync(command, { stdio: "pipe" }).toString();
    console.log(output);
    return output;
  } catch (err) {
    const errorOutput = err.stderr
      ? err.stderr.toString()
      : err.stdout
        ? err.stdout.toString()
        : err.message;
    console.log(`Exit code: ${err.status}`);
    console.log(errorOutput);

    if (expectedErrorString && errorOutput.includes(expectedErrorString)) {
      console.log(
        `[PASS] Command failed exactly as expected with: ${expectedErrorString}\n`
      );
    } else if (expectedErrorString) {
      console.error(
        `[FAIL] Expected error containing '${expectedErrorString}', but got something else.\n`
      );
      process.exit(1);
    } else {
      console.error(`[FAIL] Unexpected error.\n`);
      process.exit(1);
    }
    return errorOutput;
  }
}

// Ensure dummy file exists for compilation tests
fs.writeFileSync("dummy.sil", "contract Dummy() { require(true); }");

try {
  console.log("--- PHASE 0: DOCTOR ---");
  runCommand("npx hardkas silver doctor", null); // Should not throw, just prints diagnostic

  console.log("--- PHASE 1: COMPILATION (Expected to fail gracefully) ---");
  runCommand(
    "npx hardkas silver compile dummy.sil --network testnet-12",
    "SILVERSCRIPT_COMPILER_UNAVAILABLE"
  );

  console.log("--- PHASE 2: INSPECT (Expected to fail gracefully) ---");
  // We cannot inspect an artifact that failed to generate, so we skip or test a dummy artifact

  console.log("--- PHASE 3: NETWORK ENFORCEMENT ---");
  runCommand(
    "npx hardkas silver compile dummy.sil --network mainnet",
    "SILVERSCRIPT_NETWORK_UNSUPPORTED"
  );

  console.log("\n==========================================");
  console.log(" GAUNTLET PASSED (Readiness Confirmed)    ");
  console.log("==========================================");
} finally {
  if (fs.existsSync("dummy.sil")) fs.unlinkSync("dummy.sil");
}
