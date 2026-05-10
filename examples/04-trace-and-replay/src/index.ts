import { 
  Hardkas, 
  formatSompi, 
  parseKasToSompi,
  TxPlanArtifact,
  SignedTxArtifact,
  TxReceiptArtifact,
  TxTraceArtifact,
  ARTIFACT_SCHEMAS,
  HARDKAS_VERSION,
  writeArtifact,
  createTxPlanArtifact,
  buildPaymentPlan,
  signTxPlanArtifact
} from "@hardkas/sdk";
import fs from "node:fs";
import path from "node:path";

/**
 * Example 04: Trace and Replay
 * 
 * Demonstrates deterministic transaction simulation, artifact generation,
 * and replay verification in a Kaspa-native context.
 */
async function main() {
  console.log("╔══════════════════════════════╗");
  console.log("║         HardKAS              ║");
  console.log("║    Trace & Replay Demo       ║");
  console.log("╚══════════════════════════════╝\n");

  // 1. Initialize Hardkas SDK
  const hardkas = await Hardkas.create();
  const artifactsDir = path.join(process.cwd(), "artifacts");
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir);

  const alice = await hardkas.accounts.resolve("alice");
  const bob = await hardkas.accounts.resolve("bob");
  const amount = parseKasToSompi("10");

  console.log("# Transaction Parameters");
  console.log("------------------------");
  console.log(`From:   ${alice.name} (${alice.address})`);
  console.log(`To:     ${bob.name} (${bob.address})`);
  console.log(`Amount: ${formatSompi(amount)}\n`);

  const traceSteps: TxTraceArtifact["steps"] = [];

  const addTrace = (phase: string, status: string, details?: any) => {
    traceSteps.push({
      phase,
      status,
      timestamp: new Date().toISOString(),
      details
    });
    console.log(`[${phase.padEnd(15)}] ${status}`);
  };

  // 2. Phase: Resolve UTXOs (Deterministic Mock)
  addTrace("resolve-utxos", "start");
  const mockUtxo = {
    outpoint: {
      transactionId: "a".repeat(64),
      index: 0
    },
    address: alice.address!,
    amountSompi: parseKasToSompi("100"),
    scriptPublicKey: "20" + "b".repeat(64) + "ac"
  };
  addTrace("resolve-utxos", "completed", { count: 1, totalSompi: mockUtxo.amountSompi.toString() });

  // 3. Phase: Build Transaction Plan
  addTrace("build-plan", "start");
  const builderPlan = buildPaymentPlan({
    fromAddress: alice.address!,
    availableUtxos: [mockUtxo],
    outputs: [{
      address: bob.address!,
      amountSompi: amount
    }],
    feeRateSompiPerMass: 1n
  });

  const planArtifact = createTxPlanArtifact({
    networkId: hardkas.network,
    mode: "simulated",
    from: {
      input: alice.name,
      address: alice.address!,
      accountName: alice.name
    },
    to: {
      input: bob.name,
      address: bob.address!
    },
    amountSompi: amount,
    plan: builderPlan
  });
  addTrace("build-plan", "completed", { planId: planArtifact.planId });

  // 4. Phase: Estimate Mass & Fee
  addTrace("estimate", "start");
  console.log(`  Estimated Mass: ${planArtifact.estimatedMass}`);
  console.log(`  Estimated Fee:  ${planArtifact.estimatedFeeSompi} sompi`);
  addTrace("estimate", "completed");

  // 5. Phase: Sign
  addTrace("sign", "start");
  const signedArtifact = await signTxPlanArtifact({
    planArtifact,
    account: alice,
    config: hardkas.config.config
  });
  addTrace("sign", "completed", { signedId: signedArtifact.signedId, txId: signedArtifact.txId });

  // 6. Phase: Generate Trace & Receipt
  addTrace("finalize", "start");
  const txId = signedArtifact.txId || "simulated-" + Math.random().toString(36).slice(2, 10);
  
  const trace: TxTraceArtifact = {
    schema: ARTIFACT_SCHEMAS.TX_TRACE || "hardkas.txTrace.v1" as any,
    hardkasVersion: HARDKAS_VERSION,
    networkId: hardkas.network,
    mode: "simulated",
    createdAt: new Date().toISOString(),
    txId,
    steps: traceSteps
  };

  const receipt: TxReceiptArtifact = {
    schema: ARTIFACT_SCHEMAS.TX_RECEIPT,
    hardkasVersion: HARDKAS_VERSION,
    networkId: hardkas.network,
    mode: "simulated",
    status: "accepted",
    createdAt: new Date().toISOString(),
    submittedAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(),
    txId,
    sourceSignedId: signedArtifact.signedId,
    from: { address: alice.address!, accountName: alice.name },
    to: { address: bob.address! },
    amountSompi: amount.toString(),
    amount: formatSompi(amount),
    feeSompi: planArtifact.estimatedFeeSompi,
    rpcUrl: "simulated"
  };
  addTrace("finalize", "completed");

  // 7. Store Artifacts
  console.log("\n# Storing Artifacts");
  console.log("-------------------");
  const planPath = path.join(artifactsDir, "tx-plan.json");
  const tracePath = path.join(artifactsDir, "tx-trace.json");
  const receiptPath = path.join(artifactsDir, "tx-receipt.json");
  
  await writeArtifact(planPath, planArtifact);
  await writeArtifact(tracePath, trace);
  await writeArtifact(receiptPath, receipt);
  
  console.log(`✓ tx-plan.json    -> ${path.basename(planPath)}`);
  console.log(`✓ tx-trace.json   -> ${path.basename(tracePath)}`);
  console.log(`✓ tx-receipt.json -> ${path.basename(receiptPath)}\n`);

  // 8. Replay & Verify
  console.log("# Replay Verification");
  console.log("---------------------");
  addTrace("replay", "start");
  
  // Rebuild the plan from the same mock data
  const replayedBuilderPlan = buildPaymentPlan({
    fromAddress: alice.address!,
    availableUtxos: [mockUtxo],
    outputs: [{
      address: bob.address!,
      amountSompi: amount
    }],
    feeRateSompiPerMass: 1n
  });

  const originalFee = BigInt(planArtifact.estimatedFeeSompi);
  const originalMass = BigInt(planArtifact.estimatedMass);
  const replayedFee = replayedBuilderPlan.estimatedFeeSompi;
  const replayedMass = replayedBuilderPlan.estimatedMass;

  console.log(`  Original: Fee=${originalFee}, Mass=${originalMass}`);
  console.log(`  Replayed: Fee=${replayedFee}, Mass=${replayedMass}`);

  const matches = {
    fee: replayedFee === originalFee,
    mass: replayedMass === originalMass,
    outputs: replayedBuilderPlan.outputs.length === planArtifact.outputs.length &&
             replayedBuilderPlan.outputs.every((o, i) => 
               o.address === planArtifact.outputs[i].address && 
               o.amountSompi === BigInt(planArtifact.outputs[i].amountSompi)
             )
  };

  console.log(`- Fee Determinism:  ${matches.fee ? "✓ MATCH" : "✗ MISMATCH"}`);
  console.log(`- Mass Determinism: ${matches.mass ? "✓ MATCH" : "✗ MISMATCH"}`);
  console.log(`- Output Structure: ${matches.outputs ? "✓ MATCH" : "✗ MISMATCH"}`);

  if (matches.fee && matches.mass && matches.outputs) {
    addTrace("replay", "success");
    console.log("\n✓ Deterministic Replay Verified Successfully");
  } else {
    addTrace("replay", "failed");
    console.error("\n✗ Deterministic Replay Failed Verification");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("\n✖ Example failed");
  console.error(err);
  process.exit(1);
});
