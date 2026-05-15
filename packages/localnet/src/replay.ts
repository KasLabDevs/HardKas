import { 
  TxPlan, 
  TxReceipt, 
  calculateContentHash,
  diffArtifacts
} from "@hardkas/artifacts";
import { applySimulatedPlan } from "./transactions.js";
import { LocalnetState, ReplayVerificationReport } from "./types.js";
import { StoredSimulatedTxTrace } from "./traces.js";
import { calculateStateHash } from "./snapshot.js";
import { coreEvents } from "@hardkas/core";

export interface SimulatedReplaySummary {
  receipt: TxReceipt;
  trace: StoredSimulatedTxTrace;
  summary: {
    spentCount: number;
    createdCount: number;
    transferredSompi: bigint;
    feeSompi: bigint;
    changeSompi: bigint;
    finalDaaScore: string;
  };
}

/**
 * Verifies that a transaction replay matches the original artifacts.
 * Implements an honest replay model that differentiates between 
 * reproduced results and unimplemented consensus/bridge features.
 */
export function verifyReplay(
  state: LocalnetState,
  originalPlan: TxPlan,
  originalReceipt: TxReceipt
): ReplayVerificationReport {
  const errors: string[] = [];
  const reportDivergences: any[] = [];
  
  // 1. Plan Integrity (Deterministic self-check)
  const currentPlanHash = calculateContentHash(originalPlan);
  let planOk = true;
  if (originalPlan.contentHash && currentPlanHash !== originalPlan.contentHash) {
    planOk = false;
    const errorMsg = `TxPlan contentHash mismatch: expected ${originalPlan.contentHash}, got ${currentPlanHash}`;
    errors.push(errorMsg);
    reportDivergences.push({ path: "plan.contentHash", expected: originalPlan.contentHash, actual: currentPlanHash });
  }

  // 2. PreStateHash Verification
  //    If the original receipt recorded a preStateHash, the current state
  //    must match it before replay is valid.
  const originalPreState = originalReceipt.preStateHash;
  if (originalPreState) {
    const currentStateHash = calculateStateHash(state);
    if (currentStateHash !== originalPreState) {
      const errorMsg = `preStateHash mismatch: expected ${originalPreState}, got ${currentStateHash}`;
      errors.push(errorMsg);
      reportDivergences.push({
        path: "preStateHash",
        expected: originalPreState,
        actual: currentStateHash
      });
    }
  } else {
    // preStateHash missing from original receipt — warn but allow in non-strict
    reportDivergences.push({
      path: "preStateHash",
      expected: "present",
      actual: "missing",
      severity: "warning"
    });
  }

  // 3. Execute Replay in simulated environment
  const result = applySimulatedPlan(state, originalPlan, { txId: originalReceipt.txId });
  const replayReceipt = result.receipt;

  // 3. Semantic Diffing (Divergence detection)
  const diff = diffArtifacts(originalReceipt, replayReceipt);
  
  if (!diff.identical) {
    for (const entry of diff.entries) {
      reportDivergences.push({
        path: `receipt.${entry.path}`,
        expected: entry.left,
        actual: entry.right
      });
      errors.push(`Receipt divergence at ${entry.path}: expected ${JSON.stringify(entry.left)}, got ${JSON.stringify(entry.right)}`);
    }
  }

  // 4. Emit Events for Divergence Tracking
  for (const div of reportDivergences) {
    coreEvents.normalizeAndEmit({
      kind: "replay.divergence",
      txId: originalReceipt.txId,
      field: div.path,
      expected: String(div.expected),
      actual: String(div.actual)
    });
  }

  const invariantsOk = errors.length === 0;

  if (invariantsOk) {
    coreEvents.normalizeAndEmit({
      kind: "replay.verified",
      txId: originalReceipt.txId
    });
  }

  // Construct Honest Report
  return {
    schema: "hardkas.replayReport.v1",
    txId: originalReceipt.txId,
    planOk,
    receiptOk: !diff.entries.some(e => !e.path.startsWith("plan")),
    invariantsOk,
    checks: {
      workflowDeterministic: invariantsOk ? "reproduced" : "diverged",
      consensusValidation: "unimplemented", // Explicit trust boundary
      l2BridgeCorrectness: "unimplemented" // Explicit trust boundary
    },
    divergences: reportDivergences,
    errors
  };
}

/**
 * Loads receipt and trace for a transaction and produces a summary.
 */
export async function getSimulatedReplaySummary(txId: string, options: { cwd?: string } = {}): Promise<SimulatedReplaySummary> {
  const { loadSimulatedReceipt } = await import("./receipts.js");
  const { loadSimulatedTrace } = await import("./traces.js");

  const receipt = await loadSimulatedReceipt(txId, options);
  const trace = await loadSimulatedTrace(txId, options);

  if (!receipt || !trace) {
    throw new Error(`Receipt or trace not found for transaction: ${txId}`);
  }

  return {
    receipt,
    trace,
    summary: {
      spentCount: receipt.spentUtxoIds?.length || 0,
      createdCount: receipt.createdUtxoIds?.length || 0,
      transferredSompi: BigInt(receipt.amountSompi),
      feeSompi: BigInt(receipt.feeSompi || "0"),
      changeSompi: BigInt(receipt.changeSompi || "0"),
      finalDaaScore: receipt.daaScore || "0"
    }
  };
}
