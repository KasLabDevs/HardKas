export type Sompi = bigint;
import { estimateTransactionMass, estimateToccataFee } from "./mass.js";
import { DUST_THRESHOLD_SOMPI } from "./verify.js";
export * from "./mass.js";
export * from "./verify.js";
export * from "./service.js";
export * from "./coin-selector.js";
export * from "./fee-estimator.js";
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
  const isToccataFee = request.feePolicy === "toccata" || request.version === 1;

  for (const utxo of sortedUtxos) {
    selected.push(utxo);
    selectedAmount += utxo.amountSompi;

    // Preliminary check if we have enough to even consider fees
    if (selectedAmount < target) continue;

    // Estimate mass with change output assumed
    const result = estimateTransactionMass({
      inputCount: selected.length,
      outputs: sortedOutputs,
      payloadBytes: request.payloadBytes ?? 0,
      hasChange: true // Optimistic assumption for the loop
    });

    const estimatedMass = result.mass;
    let estimatedFeeSompi = estimatedMass * request.feeRateSompiPerMass;

    if (isToccataFee) {
      const computeBudget = request.computeBudget ?? request.computeGrams ?? 0n;
      const minimumToccataFee = estimateToccataFee(computeBudget, result.mass, result.txBytes);
      if (minimumToccataFee > estimatedFeeSompi) {
        estimatedFeeSompi = minimumToccataFee;
      }
    }

    if (selectedAmount >= target + estimatedFeeSompi) {
      const changeAmount = selectedAmount - target - estimatedFeeSompi;
      // Sub-dust change is absorbed into the fee (matching rusty-kaspa wallet behavior).
      // This prevents creating plans with dust change outputs that the node would reject.
      const hasActualChange = changeAmount >= DUST_THRESHOLD_SOMPI;

      // Recalculate mass if no change output is actually needed
      let finalMass = estimatedMass;
      let finalFee = estimatedFeeSompi;

      if (!hasActualChange) {
        const noChangeResult = estimateTransactionMass({
          inputCount: selected.length,
          outputs: sortedOutputs,
          payloadBytes: request.payloadBytes ?? 0,
          hasChange: false
        });
        finalMass = noChangeResult.mass;
        finalFee = finalMass * request.feeRateSompiPerMass;
        if (isToccataFee) {
          const computeBudget = request.computeBudget ?? request.computeGrams ?? 0n;
          const minimumToccataFee = estimateToccataFee(computeBudget, noChangeResult.mass, noChangeResult.txBytes);
          if (minimumToccataFee > finalFee) {
            finalFee = minimumToccataFee;
          }
        }

        // Re-check if still enough after potential fee change
        if (selectedAmount < target + finalFee) continue;
      }

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
          address: request.changeAddress ?? request.fromAddress,
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
