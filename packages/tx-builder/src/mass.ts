export interface MassBreakdown {
  base: bigint;
  inputs: bigint;
  outputs: bigint;
  payload: bigint;
  total: bigint;
}

export interface MassEstimateResult {
  mass: bigint;
  computeMass: bigint;
  transientMass: bigint;
  feeMass: bigint;
  txBytes: bigint;
  feeSompi: bigint;
  breakdown: MassBreakdown;
  assumptions: string[];
  warnings: string[];
}

export interface ConsensusMassInput {
  inputCount: number;
  outputs: readonly { address: string; scriptPublicKey?: string }[];
  payloadBytes?: number;
  signatureScriptBytes?: number;
  hasChange?: boolean;
}

export interface ConsensusMassResult {
  computeMass: bigint;
  transientMass: bigint;
  feeMass: bigint;
  storageMass: bigint; // Note: Strictly excluded from relay fee floor
}

/**
 * Protocol constants aligning with rusty-kaspa consensus mass calculation
 * (consensus/core/src/mass/mod.rs)
 */
export const KASPA_CONSENSUS_MASS = {
  BASE_TRANSACTION: 86n,
  INPUT_OUTPOINT_AND_SEQ: 450n, // 36b outpoint (360) + 8b seq (80) + 1b sigOpCount (10)
  SIG_SCRIPT_BYTE_MULTIPLIER: 10n,
  OUTPUT_P2PK: 420n, // 8b amount (80) + 34b SPK (340)
  SCRIPT_FALLBACK_OUTPUT: 500n,
  PAYLOAD_TRANSIENT_MULTIPLIER: 10n
} as const;

/**
 * Legacy alias constants for backward compatibility
 */
export const KASPA_MASS_CONSTANTS = {
  BASE_TRANSACTION: 86n,
  INPUT_P2PK: 1110n,
  OUTPUT_P2PK: 420n,
  SCRIPT_FALLBACK: 500n,
  PAYLOAD_BYTE: 10n
} as const;

/**
 * Calculates official rusty-kaspa consensus non-contextual mass.
 *
 * Formula:
 *   feeMass = max(computeMass, normalizedTransientMass)
 *   storageMass is excluded from relay fee floor.
 */
export function calculateConsensusNonContextualMass(input: ConsensusMassInput): ConsensusMassResult {
  const sigScriptLen = BigInt(input.signatureScriptBytes ?? 66);
  const inputComputeMass = KASPA_CONSENSUS_MASS.INPUT_OUTPOINT_AND_SEQ + (sigScriptLen * KASPA_CONSENSUS_MASS.SIG_SCRIPT_BYTE_MULTIPLIER);

  let outputsCompute = 0n;
  const outputList = input.outputs || [];
  for (const out of outputList) {
    if (isP2PK(out.scriptPublicKey || out.address)) {
      outputsCompute += KASPA_CONSENSUS_MASS.OUTPUT_P2PK;
    } else {
      outputsCompute += KASPA_CONSENSUS_MASS.SCRIPT_FALLBACK_OUTPUT;
    }
  }

  if (input.hasChange) {
    outputsCompute += KASPA_CONSENSUS_MASS.OUTPUT_P2PK;
  }

  const computeMass = KASPA_CONSENSUS_MASS.BASE_TRANSACTION + (BigInt(input.inputCount) * inputComputeMass) + outputsCompute;

  const payloadBytes = BigInt(input.payloadBytes || 0);
  const transientMass = payloadBytes * KASPA_CONSENSUS_MASS.PAYLOAD_TRANSIENT_MULTIPLIER;

  const feeMass = computeMass > transientMass ? computeMass : transientMass;

  return {
    computeMass,
    transientMass,
    feeMass,
    storageMass: 0n // Explicitly 0n for relay floor purposes
  };
}

/**
 * Estimates the mass of a transaction based on its structure and script types.
 */
export function estimateTransactionMass(input: ConsensusMassInput): MassEstimateResult {
  const assumptions: string[] = [];
  const warnings: string[] = [];

  const consensus = calculateConsensusNonContextualMass(input);

  assumptions.push(`Inputs assumed P2PK/Schnorr (${input.inputCount})`);

  return {
    mass: consensus.feeMass,
    computeMass: consensus.computeMass,
    transientMass: consensus.transientMass,
    feeMass: consensus.feeMass,
    txBytes: consensus.feeMass,
    feeSompi: 0n,
    breakdown: {
      base: KASPA_CONSENSUS_MASS.BASE_TRANSACTION,
      inputs: BigInt(input.inputCount) * 1110n,
      outputs: BigInt((input.outputs?.length || 0) + (input.hasChange ? 1 : 0)) * 420n,
      payload: BigInt(input.payloadBytes || 0) * 10n,
      total: consensus.feeMass
    },
    assumptions,
    warnings
  };
}

function isP2PK(addressOrScript: string): boolean {
  if (!addressOrScript) return true;
  if (/^[0-9a-fA-F]+$/.test(addressOrScript)) {
    return addressOrScript.length === 68;
  }
  if (addressOrScript.includes(":")) {
    const parts = addressOrScript.split(":");
    const body = parts[1];
    return !!body && (body.startsWith("q") || body.startsWith("sim_"));
  }
  return true;
}

export function estimateFeeFromMass(mass: bigint, feeRateSompiPerMass: bigint): bigint {
  return mass * feeRateSompiPerMass;
}

export function estimateToccataFee(computeBudget: bigint, txMass: bigint, txBytes: bigint): bigint {
  const computeMass = txMass + (computeBudget * 100n);
  const doubleBytes = txBytes * 2n;
  const maxVal = computeMass > doubleBytes ? computeMass : doubleBytes;
  return 100n * maxVal;
}
