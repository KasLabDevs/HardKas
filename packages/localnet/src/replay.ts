import { 
  TxPlan, 
  TxReceipt, 
  calculateContentHash 
} from "@hardkas/artifacts";
import { applySimulatedPlan } from "./transactions.js";
import { LocalnetState, ReplayVerificationReport } from "./types.js";
import { StoredSimulatedTxTrace } from "./traces.js";
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
 */
export function verifyReplay(
  state: LocalnetState,
  originalPlan: TxPlan,
  originalReceipt: TxReceipt
): ReplayVerificationReport {
  const errors: string[] = [];
  
  // 1. Plan Integrity
  const currentPlanHash = calculateContentHash(originalPlan);
  if (originalPlan.contentHash && currentPlanHash !== originalPlan.contentHash) {
    const errorMsg = `TxPlan contentHash mismatch: expected ${originalPlan.contentHash}, got ${currentPlanHash}`;
    errors.push(errorMsg);
    coreEvents.normalizeAndEmit({
      kind: "replay.divergence",
      txId: originalReceipt.txId,
      field: "planHash",
      expected: originalPlan.contentHash,
      actual: currentPlanHash
    });
  }

  // 2. Execute Replay (Dry-run by default as we don't return the new state)
  const result = applySimulatedPlan(state, originalPlan, { txId: originalReceipt.txId });
  const replayReceipt = result.receipt;

  const checks = [
    { field: "status", expected: originalReceipt.status, actual: replayReceipt.status },
    { field: "mass", expected: String(originalReceipt.mass), actual: String(replayReceipt.mass) },
    { field: "feeSompi", expected: String(originalReceipt.feeSompi), actual: String(replayReceipt.feeSompi) },
    { field: "preStateHash", expected: String(originalReceipt.preStateHash), actual: String(replayReceipt.preStateHash) },
    { field: "postStateHash", expected: String(originalReceipt.postStateHash), actual: String(replayReceipt.postStateHash) },
    { field: "spentUtxos", expected: String(originalReceipt.spentUtxoIds?.length), actual: String(replayReceipt.spentUtxoIds?.length) }
  ];

  for (const check of checks) {
    if (check.expected !== check.actual) {
      errors.push(`${check.field} mismatch: expected ${check.expected}, got ${check.actual}`);
      coreEvents.normalizeAndEmit({
        kind: "replay.divergence",
        txId: originalReceipt.txId,
        field: check.field,
        expected: check.expected,
        actual: check.actual
      });
    }
  }

  if (errors.length === 0) {
    coreEvents.normalizeAndEmit({
      kind: "replay.verified",
      txId: originalReceipt.txId
    });
  }

  return {
    planOk: !errors.some(e => e.includes("TxPlan")),
    receiptOk: !errors.some(e => e.includes("Status") || e.includes("Hash")),
    invariantsOk: errors.length === 0,
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
