import { estimateTransactionMass } from "./mass.js";

export type FeePolicy = "conservative" | "minimal";
export type NetworkType = "simulated" | "local-docker-simnet" | string;

export interface FeeEstimationRequest {
  readonly inputs: number | readonly any[];
  readonly outputs: number | readonly any[];
  readonly feeRateSompiPerMass: bigint;
  readonly network?: NetworkType;
  readonly policy?: FeePolicy;
  readonly hasChange?: boolean;
  readonly payloadBytes?: number;
}

export interface FeeEstimationResult {
  readonly estimatedMass: bigint;
  readonly feeRateSompiPerMass: bigint;
  readonly estimatedFeeSompi: bigint;
  readonly model: "mass-estimated-v1";
  readonly policy: FeePolicy;
  readonly estimated: true;
  readonly claims: {
    readonly exactNetworkFee: false;
  };
  readonly warnings: string[];
}

function parseFeeRate(rate: bigint): bigint {
  let value: bigint;
  try {
    value = BigInt(rate);
  } catch (err) {
    throw new Error("FEE_ESTIMATOR_INVALID_RATE: Unparseable fee rate.");
  }

  if (value < 0n) {
    throw new Error("FEE_ESTIMATOR_INVALID_RATE: Negative fee rates are not allowed.");
  }

  return value;
}

export function estimateFee(request: FeeEstimationRequest): FeeEstimationResult {
  const feeRate = parseFeeRate(request.feeRateSompiPerMass);
  const policy = request.policy ?? "minimal";
  const warnings: string[] = [];

  const inputCount = typeof request.inputs === 'number' ? request.inputs : request.inputs.length;
  
  let formattedOutputs: { address: string; scriptPublicKey?: string }[] = [];
  if (typeof request.outputs === 'number') {
      for(let i=0; i<request.outputs; i++) {
          formattedOutputs.push({ address: "kaspatest:qdummy" }); // valid default dummy
      }
  } else {
      formattedOutputs = [...request.outputs] as { address: string; scriptPublicKey?: string }[];
  }

    // Handle optional properties carefully for exactOptionalPropertyTypes
    const massArgs: any = {
        inputCount: inputCount,
        outputs: formattedOutputs,
        payloadBytes: request.payloadBytes ?? 0
    };
    if (request.hasChange !== undefined) {
        massArgs.hasChange = request.hasChange;
    }
    
    const massResult = estimateTransactionMass(massArgs);

  const baseFee = massResult.mass * feeRate;
  
  let estimatedFeeSompi = baseFee;
  if (policy === "conservative") {
      // Apply 10% buffer strictly with integer arithmetic
      // conservativeFee = (minimalFee * 110n + 99n) / 100n
      estimatedFeeSompi = (baseFee * 110n + 99n) / 100n;
  }

  if (massResult.warnings && massResult.warnings.length > 0) {
      warnings.push(...massResult.warnings);
  }

  return {
    estimatedMass: massResult.mass,
    feeRateSompiPerMass: feeRate,
    estimatedFeeSompi,
    model: "mass-estimated-v1",
    policy,
    estimated: true,
    claims: {
        exactNetworkFee: false
    },
    warnings
  };
}
