export type Sompi = bigint;
import { estimateTransactionMass } from "./mass.js";
export * from "./mass.js";
export * from "./verify.js";

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
}

export interface TxOutput {
  readonly address: string;
  readonly amountSompi: Sompi;
  /** Future: Silverscript / custom script support */
  readonly scriptPublicKey?: string;
}

export interface TxBuildRequest {
  readonly fromAddress: string;
  readonly outputs: readonly TxOutput[];
  readonly availableUtxos: readonly Utxo[];
  readonly feeRateSompiPerMass: bigint;
  readonly changeAddress?: string;
  readonly payloadBytes?: number;
}

export interface TxPlan {
  readonly inputs: readonly Utxo[];
  readonly outputs: readonly TxOutput[];
  readonly change?: TxOutput | undefined;
  readonly estimatedMass: bigint;
  readonly estimatedFeeSompi: bigint;
}

export function buildPaymentPlan(request: TxBuildRequest): TxPlan {
  if (request.outputs.length === 0) {
    throw new Error("At least one transaction output is required.");
  }

  const target = request.outputs.reduce(
    (sum, output) => sum + output.amountSompi,
    0n
  );

  if (target <= 0n) {
    throw new Error("Transaction amount must be positive.");
  }

  const sortedUtxos = [...request.availableUtxos].sort((a, b) =>
    a.amountSompi < b.amountSompi ? -1 : a.amountSompi > b.amountSompi ? 1 : 0
  );

  const selected: Utxo[] = [];
  let selectedAmount = 0n;

  for (const utxo of sortedUtxos) {
    selected.push(utxo);
    selectedAmount += utxo.amountSompi;

    // Preliminary check if we have enough to even consider fees
    if (selectedAmount < target) continue;

    // Estimate mass with change output assumed
    const result = estimateTransactionMass({
      inputCount: selected.length,
      outputs: request.outputs,
      payloadBytes: request.payloadBytes ?? 0,
      hasChange: true // Optimistic assumption for the loop
    });

    const estimatedMass = result.mass;
    const estimatedFeeSompi = estimatedMass * request.feeRateSompiPerMass;

    if (selectedAmount >= target + estimatedFeeSompi) {
      const changeAmount = selectedAmount - target - estimatedFeeSompi;
      const hasActualChange = changeAmount > 0n;

      // Recalculate mass if no change output is actually needed
      let finalMass = estimatedMass;
      let finalFee = estimatedFeeSompi;

      if (!hasActualChange) {
        const noChangeResult = estimateTransactionMass({
          inputCount: selected.length,
          outputs: request.outputs,
          payloadBytes: request.payloadBytes ?? 0,
          hasChange: false
        });
        finalMass = noChangeResult.mass;
        finalFee = finalMass * request.feeRateSompiPerMass;
        
        // Re-check if still enough after potential fee change
        if (selectedAmount < target + finalFee) continue;
      }

      return {
        inputs: selected,
        outputs: request.outputs,
        change: hasActualChange
            ? {
                address: request.changeAddress ?? request.fromAddress,
                amountSompi: changeAmount
              }
            : undefined,
        estimatedMass: finalMass,
        estimatedFeeSompi: finalFee
      };
    }
  }

  throw new Error("Insufficient funds for transaction amount plus estimated fee.");
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
