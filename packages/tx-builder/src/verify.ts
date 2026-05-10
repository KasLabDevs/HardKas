import { TxPlan, TxOutput } from "./index.js";
import { estimateTransactionMass } from "./mass.js";

export type SemanticVerificationSeverity = "info" | "warning" | "error" | "critical";

export interface SemanticVerificationIssue {
  code: string;
  severity: SemanticVerificationSeverity;
  message: string;
  path?: string | undefined;
}

export interface SemanticVerificationResult {
  ok: boolean;
  issues: SemanticVerificationIssue[];
  recomputedFeeSompi: bigint;
  recomputedMass: bigint;
  inputTotalSompi: bigint;
  outputTotalSompi: bigint;
  changeAmountSompi: bigint;
}

export interface SemanticVerifyContext {
  /** Known UTXOs to verify lineage against */
  utxoContext?: { address: string; amountSompi: bigint; outpoint: { transactionId: string; index: number } }[];
  /** Expected change address */
  expectedChangeAddress?: string;
  /** Minimum fee rate required by the node */
  minFeeRate?: bigint;
}

/**
 * Performs deep semantic verification of a transaction plan.
 * Validates economic invariants, mass computation, and operational consistency.
 */
export function verifyTxPlanSemantics(
  plan: TxPlan,
  context: SemanticVerifyContext = {}
): SemanticVerificationResult {
  const issues: SemanticVerificationIssue[] = [];
  
  const addIssue = (code: string, severity: SemanticVerificationSeverity, message: string, path?: string) => {
    issues.push({ code, severity, message, ...(path ? { path } : {}) });
  };

  // A. Simulation vs Real separation
  if ((plan as any).mode === "simulated" && (plan as any).networkId !== "simnet") {
    addIssue("ENV_CONSISTENCY_FAILURE", "error", `Environment mismatch: simulated plan must target 'simnet', but targets '${(plan as any).networkId}'`);
  }

  // B. Address Integrity
  if (!plan.inputs.every(i => i.address.includes(":"))) {
     addIssue("INVALID_ADDRESS_FORMAT", "error", "One or more input addresses are missing prefix (e.g. kaspa:)");
  }
  if (!plan.outputs.every(o => o.address.includes(":"))) {
     addIssue("INVALID_ADDRESS_FORMAT", "error", "One or more output addresses are missing prefix (e.g. kaspa:)");
  }

  // 1. Economic Totals
  const inputTotalSompi = plan.inputs.reduce((sum, i) => sum + BigInt(i.amountSompi), 0n);
  const outputTotalSompi = plan.outputs.reduce((sum, o) => sum + BigInt(o.amountSompi), 0n);
  const changeAmountSompi = plan.change ? BigInt(plan.change.amountSompi) : 0n;
  const planFeeSompi = BigInt(plan.estimatedFeeSompi);

  const recomputedFeeSompi = inputTotalSompi - outputTotalSompi - changeAmountSompi;

  // 2. Invariant Checks
  if (inputTotalSompi <= 0n) {
    addIssue("ZERO_INPUTS", "critical", "Transaction has zero or negative total inputs.");
  }

  if (outputTotalSompi <= 0n) {
    addIssue("ZERO_OUTPUTS", "error", "Transaction has zero or negative total outputs (excluding change).");
  }

  if (recomputedFeeSompi < 0n) {
    addIssue("NEGATIVE_FEE", "critical", `Negative fee detected: inputs (${inputTotalSompi}) < outputs + change (${outputTotalSompi + changeAmountSompi})`);
  }

  // 3. Mass & Fee Consistency
  const massResult = estimateTransactionMass({
    inputCount: plan.inputs.length,
    outputs: plan.outputs,
    hasChange: !!plan.change
  });
  const recomputedMass = massResult.mass;

  if (recomputedMass !== BigInt(plan.estimatedMass)) {
    addIssue("MASS_MISMATCH", "critical", `Mass mismatch: plan says ${plan.estimatedMass}, recomputed ${recomputedMass}`);
  }

  if (planFeeSompi !== recomputedFeeSompi) {
     addIssue("FEE_MISMATCH", "critical", `Fee mismatch: estimatedFeeSompi (${planFeeSompi}) does not match input-output delta (${recomputedFeeSompi})`);
  }

  // 4. Output Validation (Dust, Negative, Duplicate)
  plan.outputs.forEach((o, i) => {
    if (BigInt(o.amountSompi) <= 0n) {
      addIssue("INVALID_OUTPUT_AMOUNT", "error", `Output ${i} has non-positive amount: ${o.amountSompi}`, `outputs[${i}]`);
    }
    // Simple dust check (Kaspa dust is usually 600 sompi for standard P2PKH)
    if (BigInt(o.amountSompi) < 600n) {
      addIssue("DUST_OUTPUT", "warning", `Output ${i} might be dust: ${o.amountSompi} sompi`, `outputs[${i}]`);
    }
  });

  if (plan.change && BigInt(plan.change.amountSompi) < 600n) {
    addIssue("DUST_CHANGE", "warning", `Change output might be dust: ${plan.change.amountSompi} sompi`, "change");
  }

  // 5. Input Validation (Duplicates)
  const seenInputs = new Set<string>();
  plan.inputs.forEach((input, i) => {
    const id = `${input.outpoint.transactionId}:${input.outpoint.index}`;
    if (seenInputs.has(id)) {
      addIssue("DUPLICATE_INPUT", "critical", `Duplicate input detected: ${id}`, `inputs[${i}]`);
    }
    seenInputs.add(id);
  });

  // 6. Context-aware checks
  if (context.utxoContext) {
    plan.inputs.forEach((input, i) => {
      const match = context.utxoContext?.find(u => 
        u.outpoint.transactionId === input.outpoint.transactionId && 
        u.outpoint.index === input.outpoint.index
      );
      if (!match) {
        addIssue("UNKNOWN_INPUT", "error", `Input ${i} not found in provided UTXO context`, `inputs[${i}]`);
      } else if (BigInt(match.amountSompi) !== BigInt(input.amountSompi)) {
        addIssue("INPUT_AMOUNT_MISMATCH", "critical", `Input ${i} amount mismatch: plan says ${input.amountSompi}, context says ${match.amountSompi}`, `inputs[${i}]`);
      }
    });
  }

  if (context.expectedChangeAddress && plan.change) {
    if (plan.change.address !== context.expectedChangeAddress) {
      addIssue("CHANGE_ADDRESS_MISMATCH", "error", `Change address mismatch: expected ${context.expectedChangeAddress}, got ${plan.change.address}`, "change.address");
    }
  }

  return {
    ok: issues.every(i => i.severity !== "error" && i.severity !== "critical"),
    issues,
    recomputedFeeSompi,
    recomputedMass,
    inputTotalSompi,
    outputTotalSompi,
    changeAmountSompi
  };
}

/**
 * Performs semantic verification of a signed transaction artifact.
 */
export function verifySignedTxSemantics(
  signed: any, // Using any for artifact structure compatibility without circular deps
  plan?: TxPlan
): { ok: boolean; issues: SemanticVerificationIssue[] } {
  const issues: SemanticVerificationIssue[] = [];
  
  const addIssue = (code: string, severity: SemanticVerificationSeverity, message: string) => {
    issues.push({ code, severity, message });
  };

  if (plan) {
    if (signed.sourcePlanId !== (plan as any).planId && signed.sourcePlanId !== (plan as any).contentHash) {
       // Note: planId might be contentHash in some versions
    }
    
    if (BigInt(signed.amountSompi) !== BigInt((plan as any).amountSompi)) {
      addIssue("IMMUTABLE_FIELD_MUTATION", "critical", `Security violation: amountSompi changed from ${(plan as any).amountSompi} to ${signed.amountSompi} after signing`);
    }
    
    if (signed.networkId !== (plan as any).networkId) {
      addIssue("NETWORK_MISMATCH", "critical", `Security violation: networkId changed from ${(plan as any).networkId} to ${signed.networkId} after signing`);
    }
  }

  if (!signed.signedTransaction?.payload) {
    addIssue("MISSING_PAYLOAD", "error", "Signed transaction is missing its raw payload");
  }

  return {
    ok: issues.every(i => i.severity !== "error" && i.severity !== "critical"),
    issues
  };
}

/**
 * Performs semantic verification of a transaction receipt artifact.
 */
export function verifyTxReceiptSemantics(
  receipt: any
): { ok: boolean; issues: SemanticVerificationIssue[] } {
  const issues: SemanticVerificationIssue[] = [];
  
  const addIssue = (code: string, severity: SemanticVerificationSeverity, message: string) => {
    issues.push({ code, severity, message });
  };

  if (receipt.status === "accepted" && !receipt.txId) {
    addIssue("MISSING_TXID", "error", "Accepted receipt is missing transaction ID");
  }

  if (receipt.mode === "simulated" && !receipt.tracePath) {
    addIssue("MISSING_TRACE", "warning", "Simulated receipt is missing trace path");
  }

  return {
    ok: issues.every(i => i.severity !== "error" && i.severity !== "critical"),
    issues
  };
}
