export interface MassBreakdown {
  base: bigint;
  inputs: bigint;
  outputs: bigint;
  payload: bigint;
  total: bigint;
}

export interface MassEstimateResult {
  mass: bigint;
  feeSompi: bigint;
  breakdown: MassBreakdown;
  assumptions: string[];
  warnings: string[];
}

/**
 * Protocol-aware mass estimation constants for Kaspa (approximate).
 * These values align with standard P2PK/Schnorr transactions.
 */
export const KASPA_MASS_CONSTANTS = {
  /** Base transaction overhead (version, locktime, subnetwork id, gas, etc.) */
  BASE_TRANSACTION: 100n,
  
  /** Mass per input (Outpoint + Sequence + SigScript + SigOpCount) */
  INPUT_P2PK: 150n,
  
  /** Mass per output (Amount + ScriptPublicKey length prefix + ScriptPublicKey) */
  OUTPUT_P2PK: 50n,
  
  /** Fallback mass for unknown script types (P2SH, etc.) */
  SCRIPT_FALLBACK: 150n,

  /** Mass per byte of payload */
  PAYLOAD_BYTE: 1n
} as const;

/**
 * Estimates the mass of a transaction based on its structure and script types.
 * 
 * Note: alpha mass estimation is protocol-aware but still validated 
 * as best-effort until parity tests with kaspad/rusty-kaspa are complete.
 */
export function estimateTransactionMass(input: {
  inputCount: number;
  outputs: readonly { address: string; scriptPublicKey?: string }[];
  payloadBytes?: number;
  hasChange?: boolean;
}): MassEstimateResult {
  const assumptions: string[] = [];
  const warnings: string[] = [];

  const base = KASPA_MASS_CONSTANTS.BASE_TRANSACTION;
  
  // All inputs are assumed P2PK/Schnorr for now in this version
  const inputs = BigInt(input.inputCount) * KASPA_MASS_CONSTANTS.INPUT_P2PK;
  assumptions.push(`Inputs assumed P2PK/Schnorr (${input.inputCount})`);
  
  // Calculate output mass based on script types
  let outputs = 0n;
  
  for (const out of input.outputs) {
    if (isP2PK(out.scriptPublicKey || out.address)) {
      outputs += KASPA_MASS_CONSTANTS.OUTPUT_P2PK;
    } else {
      outputs += KASPA_MASS_CONSTANTS.SCRIPT_FALLBACK;
      warnings.push(`P2SH/Other script detected for address: ${out.address}. Mass is estimated using placeholder script-size assumptions.`);
    }
  }
  
  // Add change output if applicable (assumed P2PK)
  if (input.hasChange) {
    outputs += KASPA_MASS_CONSTANTS.OUTPUT_P2PK;
  }

  const payload = BigInt(input.payloadBytes || 0) * KASPA_MASS_CONSTANTS.PAYLOAD_BYTE;

  const total = base + inputs + outputs + payload;

  return {
    mass: total,
    feeSompi: 0n, // Placeholder, calculated by caller
    breakdown: {
      base,
      inputs,
      outputs,
      payload,
      total
    },
    assumptions,
    warnings
  };
}

/**
 * Heuristic to detect P2PK vs P2SH/Other.
 * In Kaspa, addresses starting with 'kaspa:' followed by 'q' are usually P2PK (Schnorr).
 */
function isP2PK(addressOrScript: string): boolean {
  // If it's a script (hex), check length for standard P2PK (34 bytes usually)
  if (/^[0-9a-fA-F]+$/.test(addressOrScript)) {
    return addressOrScript.length === 68; // 34 bytes * 2
  }
  
  // If it's an address
  if (addressOrScript.includes(":")) {
    const parts = addressOrScript.split(":");
    const body = parts[1];
    return !!body && (body.startsWith("q") || body.startsWith("sim_")); 
  }
  
  return true; // Default to P2PK for simplicity
}

/**
 * Calculates fee from mass and fee rate.
 */
export function estimateFeeFromMass(mass: bigint, feeRateSompiPerMass: bigint): bigint {
  return mass * feeRateSompiPerMass;
}
