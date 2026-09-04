import { UTXO } from "@hardkas/core";
import { estimateTransactionMass } from "./mass.js";
import { estimateFee, DEFAULT_MINIMUM_RELAY_RATE_SOMPI_PER_MASS } from "./fee-estimator.js";

const DUST_THRESHOLD_SOMPI = 600n;
export const MAX_FEE_SELECTION_PASSES = 10;

export class FeeConvergenceError extends Error {
  readonly code = "FEE_CONVERGENCE_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "FeeConvergenceError";
  }
}

export type SelectionPolicy = "largest-first" | "oldest-first" | "exact-match";
export type EngineFeePolicy = "network-standard" | "network-priority" | { exact: number };

export interface TransactionIntent {
  outputs: { address: string; amountSompi: string }[];
}

export interface TransactionContext {
  availableUtxos: UTXO[];
  changeAddress: string;
  minimumSignatures?: number;
}

export interface TransactionPolicies {
  fee: EngineFeePolicy;
  selection: SelectionPolicy;
}

export interface TransactionEngineConfig {
  intent: TransactionIntent;
  context: TransactionContext;
  policies: TransactionPolicies;
}

export interface Output {
  address: string;
  amountSompi: string;
}

export interface TxPlan {
  ok: boolean;
  error?: string;
  inputs: UTXO[];
  outputs: Output[];
  change?: Output | undefined;
  mass: string;
  fee: string;
  unsignedPayload: string;
}

/**
 * Agnostic Transaction Engine.
 * Takes intent, context and policies to orchestrate selection, mass, fees and change.
 */
export function buildTransaction(config: TransactionEngineConfig): TxPlan {
  try {
    // 0. Validate Intent
    if (!config.intent.outputs || config.intent.outputs.length === 0) {
      throw new Error("Transaction intent must have at least one output.");
    }
    
    let targetSompi = 0n;
    for (const out of config.intent.outputs) {
      if (!out.address) {
        throw new Error("Invalid output: missing address.");
      }
      const amt = BigInt(out.amountSompi);
      if (amt <= 0n) {
        throw new Error(`Invalid output amount for address ${out.address}: ${out.amountSompi}`);
      }
      if (amt < DUST_THRESHOLD_SOMPI) {
        throw new Error(`Output amount ${out.amountSompi} for address ${out.address} is below dust threshold.`);
      }
      targetSompi += amt;
    }

    if (!config.context.availableUtxos || config.context.availableUtxos.length === 0) {
        throw new Error("No available UTXOs provided in context.");
    }

    let feeRate = DEFAULT_MINIMUM_RELAY_RATE_SOMPI_PER_MASS; // 100 sompi/gram default
    if (typeof config.policies.fee === "object" && config.policies.fee.exact !== undefined) {
       feeRate = BigInt(config.policies.fee.exact);
    } else if (config.policies.fee === "network-priority") {
       feeRate = 200n;
    }

    // Sort available utxos based on policy
    let pool = [...config.context.availableUtxos];
    if (config.policies.selection === "largest-first") {
       pool.sort((a, b) => (BigInt(b.amountSompi) > BigInt(a.amountSompi) ? 1 : -1));
    } else if (config.policies.selection === "exact-match") {
       pool.sort((a, b) => (BigInt(a.amountSompi) > BigInt(b.amountSompi) ? 1 : -1));
    }
    
    let selectedUtxos: UTXO[] = [];
    let inputsTotal = 0n;
    let currentFee = 0n;
    let changeAmount = 0n;
    let mass = 0n;
    let hasChange = false;
    let iter = 0;

    const maxPasses = Math.min(pool.length + 2, MAX_FEE_SELECTION_PASSES);

    while (iter < maxPasses) {
        iter++;
        
        const needed = targetSompi + currentFee;
        inputsTotal = 0n;
        selectedUtxos = [];
        
        for (const utxo of pool) {
            if (inputsTotal >= needed && config.policies.selection !== "exact-match") {
                break;
            }
            selectedUtxos.push(utxo);
            inputsTotal += BigInt(utxo.amountSompi);
        }

        if (inputsTotal < needed) {
             throw new Error(`Insufficient funds. Required: ${needed}, Available: ${inputsTotal}`);
        }

        hasChange = inputsTotal > needed; 
        const massResult = estimateTransactionMass({
            inputCount: selectedUtxos.length,
            outputs: config.intent.outputs,
            hasChange: hasChange
        });
        mass = massResult.mass;

        const estimatedFeeRes = estimateFee({
            inputs: selectedUtxos.length,
            outputs: config.intent.outputs.length,
            feeRateSompiPerMass: feeRate,
            policy: "minimal",
            hasChange: hasChange
        });

        const recomputedFee = estimatedFeeRes.estimatedFeeSompi;

        if (recomputedFee <= currentFee || inputsTotal >= targetSompi + recomputedFee) {
            currentFee = recomputedFee;
            changeAmount = inputsTotal - targetSompi - currentFee;
            break;
        }

        currentFee = recomputedFee;

        if (iter === maxPasses && recomputedFee > currentFee) {
          throw new FeeConvergenceError(`Fee and UTXO selection failed to converge after ${maxPasses} passes.`);
        }
    }

    let changeOutput: Output | undefined = undefined;
    if (changeAmount > 0n) {
        if (changeAmount < DUST_THRESHOLD_SOMPI) {
            currentFee += changeAmount;
            changeAmount = 0n;
        } else {
            changeOutput = {
                address: config.context.changeAddress,
                amountSompi: changeAmount.toString()
            };
        }
    }

    const planSummary = {
        version: 1,
        inputs: selectedUtxos.map(u => ({ txId: u.outpoint.transactionId, index: u.outpoint.index, amount: u.amountSompi })),
        outputs: config.intent.outputs,
        change: changeOutput,
        mass: mass.toString(),
        fee: currentFee.toString()
    };

    return {
        ok: true,
        inputs: selectedUtxos,
        outputs: config.intent.outputs,
        change: changeOutput,
        mass: mass.toString(),
        fee: currentFee.toString(),
        unsignedPayload: JSON.stringify(planSummary, (_, v) => typeof v === 'bigint' ? v.toString() : v)
    };

  } catch (error: any) {
    return {
        ok: false,
        error: error.message,
        inputs: [],
        outputs: [],
        mass: "0",
        fee: "0",
        unsignedPayload: ""
    };
  }
}
