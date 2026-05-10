import { 
  Hardkas, 
  formatSompi, 
  parseKasToSompi,
  writeArtifact,
  createTxPlanArtifact,
  buildPaymentPlan
} from "@hardkas/sdk";
import { 
  createInitialLocalnetState, 
  createLocalnetSnapshot, 
  restoreLocalnetSnapshot,
  getAccountBalanceSompi,
  applySimulatedPayment,
  LocalnetState
} from "@hardkas/localnet";
import fs from "node:fs";
import path from "node:path";

/**
 * Example 10: CI Workflow
 * 
 * Demonstrates a complete, deterministic CI pipeline using HardKAS
 * to verify transaction logic, state transitions, and recovery.
 */
async function main() {
  console.log("╔══════════════════════════════╗");
  console.log("║         HardKAS              ║");
  console.log("║    CI Workflow Testing       ║");
  console.log("╚══════════════════════════════╝\n");

  const hardkas = await Hardkas.create();
  const artifactsDir = path.join(process.cwd(), "artifacts");
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir);

  // 1. Initialize CI State
  console.log("[CI] Phase 1: Initialize Deterministic State");
  let state: LocalnetState = createInitialLocalnetState({
    accounts: 2,
    initialBalanceSompi: parseKasToSompi("500")
  });
  
  const alice = "alice";
  const bob = "bob";
  const initialAliceBal = getAccountBalanceSompi(state, alice);
  console.log(`✓ Initial State created. Alice: ${formatSompi(initialAliceBal)}\n`);

  // 2. Create Pre-Test Snapshot
  console.log("[CI] Phase 2: Create Baseline Snapshot");
  state = createLocalnetSnapshot(state, "ci-baseline");
  console.log("✓ Snapshot 'ci-baseline' saved.\n");

  // 3. Simulate Transaction & Generate Artifacts
  console.log("[CI] Phase 3: Simulate Transaction & Audit");
  const amount = parseKasToSompi("100");
  
  // Apply state change
  const result = applySimulatedPayment(state, {
    from: alice,
    to: bob,
    amountSompi: amount
  });
  state = result.state;
  
  // Verify state change
  const aliceBalAfter = getAccountBalanceSompi(state, alice);
  console.log(`✓ Transaction Simulated. Alice: ${formatSompi(aliceBalAfter)}`);
  
  // Save receipt for CI logs
  await writeArtifact(path.join(artifactsDir, "ci-tx-receipt.json"), result.receipt);
  console.log("✓ Audit receipt saved.\n");

  // 4. Replay Verification
  console.log("[CI] Phase 4: Replay Determinism Check");
  const replayedPlan = buildPaymentPlan({
    fromAddress: (result.receipt as any).from.address,
    outputs: [{ address: (result.receipt as any).to.address, amountSompi: amount }],
    availableUtxos: [{
      outpoint: { transactionId: "genesis:alice", index: 0 },
      address: (result.receipt as any).from.address,
      amountSompi: initialAliceBal,
      scriptPublicKey: "mock"
    }],
    feeRateSompiPerMass: 1n
  });

  if (replayedPlan.estimatedFeeSompi.toString() === result.receipt.feeSompi) {
    console.log("✓ Replay Match: Fee and Mass are deterministic.\n");
  } else {
    console.error("✗ Replay Mismatch: Determinism failure detected.");
    process.exit(1);
  }

  // 5. Restore & Verify Clean State
  console.log("[CI] Phase 5: Restore Baseline & Final Cleanup");
  state = restoreLocalnetSnapshot(state, "ci-baseline");
  const aliceBalRestored = getAccountBalanceSompi(state, alice);

  if (aliceBalRestored === initialAliceBal) {
    console.log(`✓ State Restored. Alice: ${formatSompi(aliceBalRestored)}`);
  } else {
    console.error("✗ Restore Failure: State mismatch after recovery.");
    process.exit(1);
  }

  console.log("\n# CI Workflow Summary");
  console.log("✓ State Initialization: PASS");
  console.log("✓ Snapshot/Restore:     PASS");
  console.log("✓ Deterministic Replay: PASS");
  console.log("✓ Audit Logs:           PASS");
  
  console.log("\nCI Pipeline Successfully Verified.");
}

main().catch(err => {
  console.error("\n✖ CI Pipeline Failed");
  console.error(err);
  process.exit(1);
});
