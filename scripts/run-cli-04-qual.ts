import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { resolveHardkasAccount } from "../packages/accounts/src/resolve.js";

const cliPath = path.resolve("packages/cli/dist/index.js");
const rpcUrl = "ws://127.0.0.1:18210";

console.log("=================================================");
console.log(" QUALIFICATION SUITE: SCENARIO CLI-04");
console.log("=================================================\n");

// 1. tx plan
console.log("--- 1. hardkas tx plan ---");
let planOut = "";
try {
  planOut = execSync(`node "${cliPath}" tx plan --from alice --to bob --amount 10 --network simnet --fee-rate 200 --url ${rpcUrl} --out test-plan.json --json`, { encoding: "utf-8" });
  console.log("PLAN STDOUT:\n" + planOut.trim());
} catch (e: any) {
  console.error("PLAN ERROR:", e.stdout || e.stderr || e.message);
  process.exit(1);
}

// 2. tx sign
console.log("\n--- 2. hardkas tx sign ---");
let signOut = "";
try {
  signOut = execSync(`node "${cliPath}" tx sign test-plan.json --out test-signed.json --account alice --json`, { encoding: "utf-8" });
  console.log("SIGN STDOUT:\n" + signOut.trim());
} catch (e: any) {
  console.error("SIGN ERROR:", e.stdout || e.stderr || e.message);
  process.exit(1);
}

// 3. tx send
console.log("\n--- 3. hardkas tx send ---");
let sendOut = "";
try {
  sendOut = execSync(`node "${cliPath}" tx send test-signed.json --url ${rpcUrl} --json`, { encoding: "utf-8" });
  console.log("SEND STDOUT:\n" + sendOut.trim());
} catch (e: any) {
  console.error("SEND ERROR:", e.stdout || e.stderr || e.message);
  process.exit(1);
}

// 4. Negative test: target vs --network mismatch
console.log("\n--- 4. hardkas tx send (Negative Mismatch Test) ---");
let mismatchPassed = false;
try {
  const mismatchOut = execSync(`node "${cliPath}" tx send test-signed.json --network simulated --json`, { encoding: "utf-8" });
  console.error("MISMATCH ERROR: Should have thrown error, but got:", mismatchOut);
} catch (e: any) {
  const errOutput = (e.stdout || "") + (e.stderr || "") + (e.message || "");
  console.log("MISMATCH CAUGHT EXPECTED ERROR:\n" + errOutput.trim());
  if (errOutput.includes("EXECUTION_NETWORK_MISMATCH") || errOutput.includes("EXECUTION_TARGET_MISMATCH")) {
    mismatchPassed = true;
  }
}
console.log("MISMATCH TEST VERDICT:", mismatchPassed ? "PASS" : "FAIL");

// 5. Account Resolution Type Integrity
console.log("\n--- 5. Account Resolution Type Integrity ---");
const simTarget = { mode: "simulator" as const, domain: "kaspa-l1" as const, network: "simulated" };
const localnetTarget = { mode: "localnet" as const, domain: "kaspa-l1" as const, network: "simnet" };

const simAccount = resolveHardkasAccount({ nameOrAddress: "alice", executionTarget: simTarget });
const localAccount = resolveHardkasAccount({ nameOrAddress: "alice", executionTarget: localnetTarget });
const rawKaspasimAccount = resolveHardkasAccount({ nameOrAddress: "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn", executionTarget: simTarget });

console.log("  simAccount (simulator):", simAccount.kind, simAccount.address);
console.log("  localAccount (localnet):", localAccount.kind, localAccount.address);
console.log("  rawKaspasimAccount:", rawKaspasimAccount.kind, rawKaspasimAccount.address);

const isSimSynthetic = simAccount.kind === "synthetic" && simAccount.address.startsWith("kaspa:sim_");
const isLocalDeterministic = localAccount.kind === "kaspa" && localAccount.address.startsWith("kaspasim:");
const isKaspasimNeverSynthetic = rawKaspasimAccount.kind !== "synthetic" && rawKaspasimAccount.address.startsWith("kaspasim:");

const accountIntegrityPass = isSimSynthetic && isLocalDeterministic && isKaspasimNeverSynthetic;
console.log("ACCOUNT INTEGRITY VERDICT:", accountIntegrityPass ? "PASS" : "FAIL");

// Clean up temporary test files
try { fs.unlinkSync("test-plan.json"); } catch {}
try { fs.unlinkSync("test-signed.json"); } catch {}

const overallPass = mismatchPassed && accountIntegrityPass;
console.log("\n=========================================");
console.log("CLI-04 OVERALL VERDICT:", overallPass ? "PASS ✅" : "FAIL ❌");
console.log("=========================================");
process.exit(overallPass ? 0 : 1);
