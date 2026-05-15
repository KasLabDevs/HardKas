// SAFETY_LEVEL: SIMULATION_ONLY
//
// Transaction mass profiling — breakdown and comparison.

import { estimateTransactionMass, estimateFeeFromMass } from "@hardkas/tx-builder";
import { SOMPI_PER_KAS } from "@hardkas/core";

/**
 * Deterministic number formatting (adds commas without locale dependency).
 */
function formatBigInt(n: bigint | number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export interface MassBreakdown {
  /** Total estimated mass. */
  totalMass: bigint;
  /** Mass contributed by inputs. */
  inputMass: bigint;
  /** Mass contributed by outputs. */
  outputMass: bigint;
  /** Mass contributed by payload/metadata. */
  payloadMass: bigint;
  /** Estimated fee in sompi at the given fee rate. */
  estimatedFeeSompi: bigint;
  /** Fee rate used (sompi per mass unit). */
  feeRate: bigint;
  /** Number of inputs. */
  inputCount: number;
  /** Number of outputs. */
  outputCount: number;
  /** Payload size in bytes. */
  payloadBytes: number;
}

export interface MassComparison {
  /** Current profile. */
  current: MassBreakdown;
  /** Previous profile to compare against. */
  previous: MassBreakdown;
  /** Absolute difference in total mass. */
  massDelta: bigint;
  /** Absolute difference in fee. */
  feeDelta: bigint;
  /** Percentage change in mass (positive = increase). */
  massChangePercent: number;
  /** Percentage change in fee. */
  feeChangePercent: number;
  /** True if mass increased (potential regression). */
  isRegression: boolean;
  /** Regression severity: "none" | "minor" (<10%) | "major" (>=10%) */
  severity: "none" | "minor" | "major";
}

/**
 * Profiles transaction mass based on counts and sizes.
 */
export function profileMass(opts: {
  inputCount: number;
  outputCount: number;
  payloadBytes?: number;
  feeRate?: bigint;
}): MassBreakdown {
  const inputCount = opts.inputCount;
  const outputCount = opts.outputCount;
  const payloadBytes = opts.payloadBytes ?? 0;
  const feeRate = opts.feeRate ?? 1n;

  // We use estimateTransactionMass to get the breakdown
  // Note: we assume all outputs are standard P2PK for profiling
  const result = estimateTransactionMass({
    inputCount,
    outputs: Array(outputCount).fill({ address: "kaspa:qplaceholder" }),
    payloadBytes,
    hasChange: false
  });

  const breakdown = result.breakdown;

  return {
    totalMass: breakdown.total,
    inputMass: breakdown.inputs + breakdown.base, // Base overhead is often grouped with inputs or just kept as total
    outputMass: breakdown.outputs,
    payloadMass: breakdown.payload,
    estimatedFeeSompi: estimateFeeFromMass(breakdown.total, feeRate),
    feeRate,
    inputCount,
    outputCount,
    payloadBytes
  };
}

/**
 * Compares two mass profiles and detects regressions.
 */
export function compareMassProfiles(current: MassBreakdown, previous: MassBreakdown): MassComparison {
  const massDelta = current.totalMass - previous.totalMass;
  const feeDelta = current.estimatedFeeSompi - previous.estimatedFeeSompi;

  const massChangePercent = previous.totalMass > 0n 
    ? Number(massDelta * 10000n / previous.totalMass) / 100 
    : 0;
  
  const feeChangePercent = previous.estimatedFeeSompi > 0n 
    ? Number(feeDelta * 10000n / previous.estimatedFeeSompi) / 100 
    : 0;

  const isRegression = massDelta > 0n;
  let severity: "none" | "minor" | "major" = "none";

  if (isRegression) {
    if (massChangePercent >= 10) {
      severity = "major";
    } else {
      severity = "minor";
    }
  }

  return {
    current,
    previous,
    massDelta,
    feeDelta,
    massChangePercent,
    feeChangePercent,
    isRegression,
    severity
  };
}

/**
 * Formats a mass breakdown into a readable report.
 */
export function formatMassProfile(breakdown: MassBreakdown): string {
  const kasAmount = Number(breakdown.estimatedFeeSompi) / 100_000_000;
  
  return [
    "═══ Mass Profile ═══",
    `  Inputs     : ${breakdown.inputCount} inputs → ${formatBigInt(breakdown.inputMass)} mass`,
    `  Outputs    : ${breakdown.outputCount} outputs → ${formatBigInt(breakdown.outputMass)} mass`,
    `  Payload    : ${breakdown.payloadBytes} bytes → ${formatBigInt(breakdown.payloadMass)} mass`,
    `  Total mass : ${formatBigInt(breakdown.totalMass)}`,
    `  Fee rate   : ${formatBigInt(breakdown.feeRate)} sompi/mass`,
    `  Est. fee   : ${formatBigInt(breakdown.estimatedFeeSompi)} sompi (${kasAmount.toFixed(8)} KAS)`
  ].join("\n");
}

/**
 * Formats a comparison report.
 */
export function formatMassComparison(comparison: MassComparison): string {
  const massSign = comparison.massDelta >= 0n ? "+" : "";
  const feeSign = comparison.feeDelta >= 0n ? "+" : "";
  
  const statusLine = comparison.isRegression 
    ? (comparison.severity === "major" ? "⚠️ MAJOR REGRESSION (≥10% increase)" : "ℹ️ MINOR REGRESSION (<10% increase)")
    : "✅ NO REGRESSION";

  return [
    "═══ Mass Comparison ═══",
    `  Previous   : ${formatBigInt(comparison.previous.totalMass)} mass → ${formatBigInt(comparison.previous.estimatedFeeSompi)} sompi`,
    `  Current    : ${formatBigInt(comparison.current.totalMass)} mass → ${formatBigInt(comparison.current.estimatedFeeSompi)} sompi`,
    `  Delta      : ${massSign}${formatBigInt(comparison.massDelta)} mass (${massSign}${comparison.massChangePercent.toFixed(1)}%)`,
    `  Fee delta  : ${feeSign}${formatBigInt(comparison.feeDelta)} sompi (${feeSign}${comparison.feeChangePercent.toFixed(1)}%)`,
    `  Status     : ${statusLine}`
  ].join("\n");
}
