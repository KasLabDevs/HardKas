import { 
  estimateTransactionMass, 
  estimateFeeFromMass,
  MassEstimateResult
} from "@hardkas/tx-builder";
import { 
  TxPlan, 
  SignedTx, 
  TxReceipt 
} from "./schemas.js";

export interface FeeAuditResult {
  ok: boolean;
  actualMass: bigint;
  expectedMass: bigint;
  actualFeeSompi: bigint;
  expectedFeeSompi: bigint;
  feeRateSompiPerMass: bigint;
  deltaSompi: bigint;
  issues: string[];
}

/**
 * Recomputes mass for a transaction artifact.
 */
export function recomputeMass(artifact: TxPlan | SignedTx | TxReceipt): bigint {
  if (artifact.schema === "hardkas.txPlan") {
    const plan = artifact as TxPlan;
    const result = estimateTransactionMass({
      inputCount: (plan.inputs || []).length,
      outputs: plan.outputs || [],
      hasChange: !!plan.change,
      payloadBytes: 0 // Default for now
    });
    return result.mass;
  }
  
  if (artifact.schema === "hardkas.txReceipt") {
    const receipt = artifact as TxReceipt;
    // For receipt, we check if we have enough info to recompute
    // Receipt artifacts usually store mass, but we can re-verify if inputs/outputs are present
    // In V2 receipts, we might need to store more metadata to recompute exactly
    return BigInt(receipt.mass || 0);
  }

  return 0n;
}

/**
 * Performs a deep economic audit of a transaction artifact.
 */
export function verifyFeeSemantics(artifact: any): FeeAuditResult {
  const issues: string[] = [];
  
  let artifactMass = 0n;
  let artifactFee = 0n;
  let inputTotal = 0n;
  let outputTotal = 0n;
  let feeRate = 1n; // Default

  if (artifact.schema === "hardkas.txPlan") {
    const plan = artifact as TxPlan;
    artifactMass = BigInt(plan.estimatedMass || 0);
    artifactFee = BigInt(plan.estimatedFeeSompi || 0);
    inputTotal = (plan.inputs || []).reduce((sum, i) => sum + BigInt(i.amountSompi || 0), 0n);
    outputTotal = (plan.outputs || []).reduce((sum, o) => sum + BigInt(o.amountSompi || 0), 0n);
    if (plan.change) outputTotal += BigInt(plan.change.amountSompi || 0);
  } else if (artifact.schema === "hardkas.txReceipt") {
    const receipt = artifact as TxReceipt;
    artifactMass = BigInt(receipt.mass || 0);
    artifactFee = BigInt(receipt.feeSompi);
    outputTotal = BigInt(receipt.amountSompi);
    // Receipts might not have full input list, so we rely on feeSompi consistency
  }

  // 1. Recompute Mass
  const recomputedMass = recomputeMass(artifact);
  if (recomputedMass !== artifactMass && artifactMass !== 0n) {
    issues.push(`Mass mismatch: artifact reports ${artifactMass}, recomputed ${recomputedMass}`);
  }

  // 2. Recompute Fee (using artifact's implied fee rate or default 1)
  // In a real audit, we'd want the feeRateSompiPerMass from the artifact
  const impliedFeeRate = artifactMass > 0n ? artifactFee / artifactMass : 1n;
  const recomputedFee = recomputedMass * impliedFeeRate;

  if (recomputedFee !== artifactFee && artifactFee !== 0n) {
    issues.push(`Fee mismatch: artifact reports ${artifactFee}, recomputed ${recomputedFee} (at rate ${impliedFeeRate})`);
  }

  // 3. Economic Invariant: Input >= Output + Fee
  if (inputTotal > 0n && inputTotal < outputTotal + artifactFee) {
    issues.push(`Economic violation: Total inputs (${inputTotal}) less than outputs + fee (${outputTotal + artifactFee})`);
  }

  // 4. Negative Fee Check
  if (artifactFee < 0n) {
    issues.push("Economic violation: Negative fee detected");
  }

  // 5. Dust Check
  if (artifact.schema === "hardkas.txPlan") {
    const plan = artifact as TxPlan;
    (plan.outputs || []).forEach((o, i) => {
      if (BigInt(o.amountSompi || 0) < 600n) { // Kaspa standard dust threshold ~600 sompi
        issues.push(`Dust output detected at index ${i}: ${o.amountSompi} sompi`);
      }
    });
  }

  return {
    ok: issues.length === 0,
    actualMass: artifactMass,
    expectedMass: recomputedMass,
    actualFeeSompi: artifactFee,
    expectedFeeSompi: recomputedFee,
    feeRateSompiPerMass: impliedFeeRate,
    deltaSompi: artifactFee - recomputedFee,
    issues
  };
}
