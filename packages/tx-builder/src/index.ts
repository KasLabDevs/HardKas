export type Sompi = bigint;
import { estimateTransactionMass, calculateUpstreamMass } from "./mass.js";
import { DUST_THRESHOLD_SOMPI } from "./verify.js";
export * from "./mass.js";
export * from "./verify.js";
export * from "./service.js";
export * from "./coin-selector.js";
export * from "./fee-estimator.js";
export * from "./kaspa-wallet-adapter.js";
export * from "./kaspa-uri.js";
export * from "./utxo-mapper.js";
export * from "./engine.js";
import { getCoinbaseMaturity } from "@hardkas/core";

export interface CovenantBindingInput {
  covenantId: string;
  authorizingInput: number;
}

export interface Outpoint {
  readonly transactionId: string;
  readonly index: number;
}

export interface Utxo {
  readonly outpoint: Outpoint;
  readonly address: string;
  readonly amountSompi: Sompi;
  readonly scriptPublicKey: string;
  readonly blockDaaScore?: bigint;
  readonly isCoinbase?: boolean;
  readonly covenantId?: string; // V1 Toccata capability
  readonly lane?: string; // V1 Toccata capability
}

export interface TxOutput {
  readonly address: string;
  readonly amountSompi: Sompi;
  /** Future: Silverscript / custom script support */
  readonly scriptPublicKey?: string;
  readonly covenant?: CovenantBindingInput; // V1 Toccata capability
}

export interface TxBuildRequest {
  readonly fromAddress: string;
  readonly outputs: readonly TxOutput[];
  readonly availableUtxos: readonly Utxo[];
  readonly feeRateSompiPerMass: bigint;
  readonly changeAddress?: string;
  readonly payloadBytes?: number;
  
  // V1 Toccata capabilities
  readonly version?: 0 | 1;
  readonly computeBudget?: bigint;
  readonly computeGrams?: bigint; // Alias for internal use
  readonly storageMass?: bigint;
  readonly lane?: string;

  /** Current virtual DAA score from the node. When provided, immature coinbase UTXOs are filtered out. */
  readonly virtualDaaScore?: bigint;
  /** Coinbase maturity period in DAA blocks. Defaults to network specific value or 1000. */
  readonly coinbaseMaturity?: bigint;
  /** Network ID to determine default coinbase maturity. */
  readonly networkId?: string;
  
  /** Fee calculation policy. Auto uses toccata if version >= 1 or if node supports it. */
  readonly feePolicy?: "legacy" | "toccata" | "auto";

  readonly genesisCovenantGroups?: readonly { authorizingInput: number; outputIndices: number[] }[];

  /** When provided, overrides the mass-based fee calculation with this exact fee. Used by the convergence loop when an external feeEstimator has already determined the fee. */
  readonly feeOverrideSompi?: bigint;
}

export interface TxPlan {
  readonly version: 0 | 1;
  readonly inputs: readonly Utxo[];
  readonly outputs: readonly TxOutput[];
  readonly change?: TxOutput | undefined;
  readonly estimatedMass: bigint;
  readonly estimatedFeeSompi: bigint;
  readonly computeBudget?: bigint; // Passed through to inputs
  readonly storageMass?: bigint;
  readonly lane?: string;
}

export function buildPaymentPlan(request: TxBuildRequest): TxPlan {
  if (request.outputs.length === 0) {
    throw new Error("At least one transaction output is required.");
  }

  // 1. Canonical Output Sorting (recipients only; change is kept separate and appended last)
  const sortedOutputs = [...request.outputs].sort((a, b) => {
    if (a.amountSompi < b.amountSompi) return -1;
    if (a.amountSompi > b.amountSompi) return 1;
    if (a.address < b.address) return -1;
    if (a.address > b.address) return 1;
    return 0;
  });

  const target = sortedOutputs.reduce((sum, output) => sum + output.amountSompi, 0n);

  if (target <= 0n) {
    throw new Error("Transaction amount must be positive.");
  }

  // 2. Filter immature coinbase UTXOs before selection
  if (request.coinbaseMaturity === undefined) {
    throw new Error("COINBASE_MATURITY_UNRESOLVED: coinbaseMaturity must be explicitly provided to TxBuilder");
  }
  const COINBASE_MATURITY = request.coinbaseMaturity;
  let candidateUtxos: readonly Utxo[] = request.availableUtxos;

  if (request.virtualDaaScore !== undefined) {
    candidateUtxos = request.availableUtxos.filter(utxo => {
      if (
        utxo.isCoinbase &&
        utxo.blockDaaScore !== undefined &&
        (request.virtualDaaScore! - utxo.blockDaaScore) < COINBASE_MATURITY
      ) {
        return false; // Immature coinbase — exclude
      }
      return true;
    });
  }

  // 3. Canonical Candidate UTXO Input Sorting (Pre-Selection)
  const sortedUtxos = [...candidateUtxos].sort((a, b) => {
    // a.amountSompi ASC
    if (a.amountSompi < b.amountSompi) return -1;
    if (a.amountSompi > b.amountSompi) return 1;

    // b.transactionId ASC (tie-breaker 1)
    if (a.outpoint.transactionId < b.outpoint.transactionId) return -1;
    if (a.outpoint.transactionId > b.outpoint.transactionId) return 1;

    // c.index ASC (tie-breaker 2)
    if (a.outpoint.index < b.outpoint.index) return -1;
    if (a.outpoint.index > b.outpoint.index) return 1;

    return 0;
  });

  const selected: Utxo[] = [];
  let selectedAmount = 0n;
  const changeAddress = request.changeAddress ?? request.fromAddress;

  // Mass and the node's minimum fee come from the pinned SDK, over the real
  // unsigned candidate (inputs, outputs, change). The fee rate is policy on
  // top of that and can raise the fee, never lower it below the minimum.
  // The standard-mass error, reported only if it is what stopped the final
  // attempt (every candidate UTXO, no change); otherwise funds are the cause.
  let nonStandard: Error | undefined;
  let lastAttemptNonStandard = false;

  // Returns undefined when the transaction as built would exceed the maximum
  // standard mass: that shape is not viable, and the planner tries another.
  const feeFor = (inputs: readonly Utxo[], change: bigint | undefined): { mass: bigint; fee: bigint } | undefined => {
    let upstream;
    try {
      upstream = calculateUpstreamMass({
        networkId: request.networkId,
        version: request.version ?? 0,
        payloadBytes: request.payloadBytes ?? 0,
        inputs: inputs.map((u) => ({ amountSompi: u.amountSompi, outpoint: u.outpoint, scriptPublicKey: u.scriptPublicKey })),
        outputs: [
          ...sortedOutputs.map((o) => ({ amountSompi: o.amountSompi, address: o.address, scriptPublicKey: o.scriptPublicKey })),
          ...(change !== undefined ? [{ amountSompi: change, address: changeAddress }] : [])
        ]
      });
    } catch (e: any) {
      if (e?.code !== "TX_MASS_ABOVE_STANDARD_LIMIT") throw e;
      nonStandard = e;
      return undefined;
    }
    if (request.feeOverrideSompi !== undefined) {
      if (request.feeOverrideSompi < upstream.minimumFeeSompi) {
        const err = new Error(
          `FEE_BELOW_NETWORK_MINIMUM: fee override ${request.feeOverrideSompi} sompi is below the ${upstream.minimumFeeSompi} ` +
            `sompi the node requires for mass ${upstream.mass} (${upstream.authority})`
        );
        (err as any).code = "FEE_BELOW_NETWORK_MINIMUM";
        throw err;
      }
      return { mass: upstream.mass, fee: request.feeOverrideSompi };
    }
    const atRate = upstream.mass * request.feeRateSompiPerMass;
    return { mass: upstream.mass, fee: atRate > upstream.minimumFeeSompi ? atRate : upstream.minimumFeeSompi };
  };

  for (const utxo of sortedUtxos) {
    selected.push(utxo);
    selectedAmount += utxo.amountSompi;

    // Preliminary check if we have enough to even consider fees
    if (selectedAmount < target) continue;

    // With a change output: the change amount affects storage mass and the fee
    // affects the change, so settle on a fee that covers the transaction as built.
    let chosen: { mass: bigint; fee: bigint; change?: bigint } | undefined;
    let fee = selectedAmount - target >= DUST_THRESHOLD_SOMPI ? feeFor(selected, selectedAmount - target)?.fee : undefined;
    for (let pass = 0; fee !== undefined && pass < 8; pass++) {
      const change = selectedAmount - target - fee;
      // Sub-dust change is absorbed into the fee (matching rusty-kaspa wallet behavior).
      if (change < DUST_THRESHOLD_SOMPI) break;
      const required = feeFor(selected, change);
      if (!required) break;
      if (required.fee <= fee) {
        chosen = { mass: required.mass, fee, change };
        break;
      }
      fee = required.fee;
    }

    // Without a change output: everything above the target is the fee.
    if (!chosen) {
      const required = feeFor(selected, undefined);
      lastAttemptNonStandard = !required;
      if (!required || selectedAmount < target + required.fee) continue;
      chosen = { mass: required.mass, fee: selectedAmount - target };
    }

    {
      const hasActualChange = chosen.change !== undefined;
      const changeAmount = chosen.change ?? 0n;
      const finalMass = chosen.mass;
      const finalFee = chosen.fee;

      // 3. Canonical Selected Input Sorting (Post-Selection)
      const canonicalSelected = [...selected].sort((a, b) => {
        if (a.amountSompi < b.amountSompi) return -1;
        if (a.amountSompi > b.amountSompi) return 1;
        if (a.outpoint.transactionId < b.outpoint.transactionId) return -1;
        if (a.outpoint.transactionId > b.outpoint.transactionId) return 1;
        if (a.outpoint.index < b.outpoint.index) return -1;
        if (a.outpoint.index > b.outpoint.index) return 1;
        return 0;
      });

      const planResult: any = {
        version: request.version ?? 0,
        inputs: canonicalSelected,
        outputs: sortedOutputs,
        estimatedMass: finalMass,
        estimatedFeeSompi: finalFee
      };
      if (hasActualChange) {
        planResult.change = {
          address: changeAddress,
          amountSompi: changeAmount
        };
      }
      if (request.computeBudget !== undefined) {
        planResult.computeBudget = request.computeBudget;
      }
      if (request.storageMass !== undefined) {
        planResult.storageMass = request.storageMass;
      }
      if (request.lane !== undefined) {
        planResult.lane = request.lane;
      }
      return planResult as TxPlan;
    }
  }

  if (lastAttemptNonStandard && nonStandard) throw nonStandard;
  throw new Error("Insufficient funds for transaction amount plus estimated fee.");
}

/**
 * Fee for spending `inputs` entirely into one output (sweep/consolidation):
 * the output is the inputs minus the fee, and its amount feeds storage mass,
 * so the fee is settled against the SDK for the transaction as built.
 */
export function planSingleOutputSpend(input: {
  readonly networkId?: string | undefined;
  readonly inputs: readonly { readonly amountSompi: bigint | string; readonly outpoint?: Outpoint; readonly scriptPublicKey?: unknown }[];
  readonly toAddress: string;
  readonly feeRateSompiPerMass: bigint;
}): { mass: bigint; feeSompi: bigint; sendSompi: bigint } {
  const inputs = input.inputs.map((u) => ({
    amountSompi: BigInt(u.amountSompi),
    outpoint: u.outpoint,
    scriptPublicKey: u.scriptPublicKey
  }));
  const total = inputs.reduce((sum, u) => sum + u.amountSompi, 0n);
  const feeAt = (send: bigint) => {
    const upstream = calculateUpstreamMass({
      networkId: input.networkId,
      inputs,
      outputs: [{ amountSompi: send, address: input.toAddress }]
    });
    const atRate = upstream.mass * input.feeRateSompiPerMass;
    return { mass: upstream.mass, fee: atRate > upstream.minimumFeeSompi ? atRate : upstream.minimumFeeSompi };
  };

  let fee = feeAt(total).fee;
  for (let pass = 0; pass < 8; pass++) {
    const send = total - fee;
    if (send <= 0n) break;
    const required = feeAt(send);
    if (required.fee <= fee) return { mass: required.mass, feeSompi: fee, sendSompi: send };
    fee = required.fee;
  }
  throw new Error("Insufficient funds to cover the network fee for this spend.");
}

// Legacy support or internal use
export function estimateMass(input: {
  readonly inputCount: number;
  readonly outputCount: number;
  readonly payloadBytes: number;
}): bigint {
  return estimateTransactionMass({
    inputCount: input.inputCount,
    outputs: Array(input.outputCount - 1).fill({ address: "" }),
    payloadBytes: input.payloadBytes,
    hasChange: true
  }).mass;
}

export function createMockUtxo(input: {
  readonly address: string;
  readonly amountSompi: bigint;
  readonly index?: number;
}): Utxo {
  return {
    outpoint: {
      transactionId: `mock-${input.address}-${input.index ?? 0}`,
      index: input.index ?? 0
    },
    address: input.address,
    amountSompi: input.amountSompi,
    scriptPublicKey: "mock-script"
  };
}
