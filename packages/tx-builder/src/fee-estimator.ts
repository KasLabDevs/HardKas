import { estimateTransactionMass, ConsensusMassInput } from "./mass.js";

export type FeePolicy = "conservative" | "minimal";
export type NetworkType = "simulated" | "local-docker-simnet" | string;

/**
 * @deprecated Since M10-C. A hardcoded default is a HardKAS invention that
 * happens to match today's simnet floor; on any real network the fee-rate must
 * come from `networkParamsUpstream(networkId)` or `rpcFeeEstimate(rpc)` (see
 * `kaspa-wallet-adapter.ts`). Kept for backward compatibility with the
 * deprecated `estimateFee` path.
 */
export const DEFAULT_MINIMUM_RELAY_RATE_SOMPI_PER_MASS = 100n;

export interface FeeEstimationRequest {
  readonly inputs: number | readonly any[];
  readonly outputs: number | readonly any[];
  readonly feeRateSompiPerMass?: bigint;
  readonly network?: NetworkType;
  readonly policy?: FeePolicy;
  readonly hasChange?: boolean;
  readonly payloadBytes?: number;
  readonly txDetails?: ConsensusMassInput;
}

export interface FeeEstimationResult {
  readonly estimatedMass: bigint;
  readonly computeMass: bigint;
  readonly transientMass: bigint;
  readonly feeMass: bigint;
  readonly feeRateSompiPerMass: bigint;
  readonly estimatedFeeSompi: bigint;
  readonly relayFloorSompi: bigint;
  readonly model: "mass-estimated-v1";
  readonly policy: FeePolicy;
  readonly estimated: true;
  readonly claims: {
    readonly exactNetworkFee: false;
  };
  readonly warnings: string[];
}

function parseFeeRate(rate?: bigint): bigint {
  if (rate === undefined || rate === null) {
    return DEFAULT_MINIMUM_RELAY_RATE_SOMPI_PER_MASS;
  }
  let value: bigint;
  try {
    value = BigInt(rate);
  } catch (err) {
    throw new Error("FEE_ESTIMATOR_INVALID_RATE: Unparseable fee rate.");
  }

  if (value < 0n) {
    throw new Error("FEE_ESTIMATOR_INVALID_RATE: Negative fee rates are not allowed.");
  }

  return value < DEFAULT_MINIMUM_RELAY_RATE_SOMPI_PER_MASS
    ? DEFAULT_MINIMUM_RELAY_RATE_SOMPI_PER_MASS
    : value;
}

let ESTIMATE_FEE_DEPRECATION_WARNED = false;

/**
 * @deprecated Since M10-C. `estimateFee` implements a HardKAS "conservative"
 * `+10%` heuristic over the pinned SDK mass, on top of a hardcoded
 * `DEFAULT_MINIMUM_RELAY_RATE_SOMPI_PER_MASS = 100n`. Upstream
 * `Generator.estimate()` (via `estimateTransactionsUpstream` in
 * `kaspa-wallet-adapter.ts`) is exact — no +10% padding, and it reads the
 * network params from the SDK. Use that for anything you plan to submit.
 *
 * This function will continue to work through M10 for backward compatibility
 * but SHOULD NOT be used in new code.
 */
export function estimateFee(request: FeeEstimationRequest): FeeEstimationResult {
  if (!ESTIMATE_FEE_DEPRECATION_WARNED) {
    ESTIMATE_FEE_DEPRECATION_WARNED = true;
    console.warn(
      "[HardKAS] tx-builder.estimateFee is deprecated (M10-C). Use estimateTransactionsUpstream from kaspa-wallet-adapter (upstream Generator.estimate)."
    );
  }
  const feeRate = parseFeeRate(request.feeRateSompiPerMass);
  const policy = request.policy ?? "minimal";
  const warnings: string[] = [];

  const inputCount = typeof request.inputs === "number" ? request.inputs : request.inputs.length;

  let formattedOutputs: { address: string; scriptPublicKey?: string }[] = [];
  if (typeof request.outputs === "number") {
    for (let i = 0; i < request.outputs; i++) {
      formattedOutputs.push({ address: "kaspatest:qdummy" });
    }
  } else {
    formattedOutputs = [...request.outputs] as { address: string; scriptPublicKey?: string }[];
  }

  const massArgs: ConsensusMassInput = request.txDetails
    ? request.txDetails
    : {
        inputCount,
        outputs: formattedOutputs,
        payloadBytes: request.payloadBytes ?? 0,
        ...(request.hasChange !== undefined ? { hasChange: request.hasChange } : {})
      };

  // Mass and the node's minimum fee come from the pinned SDK (shape only: amounts unknown).
  const upstream = estimateTransactionMass(massArgs);
  const consensusMass = { feeMass: upstream.feeMass, computeMass: upstream.computeMass, transientMass: upstream.transientMass };

  const relayFloorSompi = upstream.feeSompi;
  const calculatedFee = consensusMass.feeMass * feeRate;

  let estimatedFeeSompi = calculatedFee > relayFloorSompi ? calculatedFee : relayFloorSompi;

  if (policy === "conservative") {
    estimatedFeeSompi = (estimatedFeeSompi * 110n + 99n) / 100n;
  }

  return {
    estimatedMass: consensusMass.feeMass,
    computeMass: consensusMass.computeMass,
    transientMass: consensusMass.transientMass,
    feeMass: consensusMass.feeMass,
    feeRateSompiPerMass: feeRate,
    estimatedFeeSompi,
    relayFloorSompi,
    model: "mass-estimated-v1",
    policy,
    estimated: true,
    claims: {
      exactNetworkFee: false
    },
    warnings
  };
}
