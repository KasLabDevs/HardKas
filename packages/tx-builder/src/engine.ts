import { UTXO } from "@hardkas/core";
import { estimateTransactionMass } from "./mass.js";
import { estimateFee } from "./fee-estimator.js";
import { selectUtxos } from "./coin-selector.js";

const DUST_THRESHOLD_SOMPI = 600n;

export type SelectionPolicy = "largest-first" | "oldest-first" | "exact-match";
export type FeePolicy = "network-standard" | "network-priority" | { exact: number };

export interface TransactionIntent {
  outputs: { address: string; amountSompi: string }[];
}

export interface TransactionContext {
  availableUtxos: UTXO[];
  changeAddress: string;
  minimumSignatures?: number;
}

export interface TransactionPolicies {
  fee: FeePolicy;
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
  change?: Output;
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

    // Prepare iterations for re-selection loop
    let feeRate = 1n; // Default network standard
    if (typeof config.policies.fee === "object" && config.policies.fee.exact !== undefined) {
       feeRate = BigInt(config.policies.fee.exact);
    } else if (config.policies.fee === "network-priority") {
       feeRate = 5n;
    }

    // 1. Normalize Outputs (done during validation)
    // 2 & 5. Coin Selection & Re-selection loop
    // We iteratively add inputs if the fee pushes us over the limit.
    
    // Sort available utxos based on policy
    let pool = [...config.context.availableUtxos];
    if (config.policies.selection === "largest-first") {
       pool.sort((a, b) => (BigInt(b.amountSompi) > BigInt(a.amountSompi) ? 1 : -1));
    } else if (config.policies.selection === "exact-match") {
       // Just basic sort for exact match, logic will pick best fitting
       pool.sort((a, b) => (BigInt(a.amountSompi) > BigInt(b.amountSompi) ? 1 : -1));
    }
    
    let selectedUtxos: UTXO[] = [];
    let inputsTotal = 0n;
    let currentFee = 0n;
    let changeAmount = 0n;
    let mass = 0n;
    let hasChange = false;
    let iter = 0;

    // Loop at most pool.length + 1 times
    while (iter < pool.length + 1) {
        iter++;
        
        // Pick minimum UTXOs to cover target + currentFee
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

        // 3. Mass Estimation
        // Re-estimate mass with newly selected inputs
        hasChange = inputsTotal > needed; 
        const massResult = estimateTransactionMass({
            inputCount: selectedUtxos.length,
            outputs: config.intent.outputs,
            hasChange: hasChange
        });
        mass = massResult.mass;

        // 4. Fee Engine
        const estimatedFeeRes = estimateFee({
            inputs: selectedUtxos.length,
            outputs: config.intent.outputs.length,
            feeRateSompiPerMass: feeRate,
            policy: "minimal", // Default to exact calculated minimal based on rate
            hasChange: hasChange
        });

        const recomputedFee = estimatedFeeRes.estimatedFeeSompi;

        // 5. Check if re-selection is needed
        if (recomputedFee <= currentFee || inputsTotal >= targetSompi + recomputedFee) {
            // Stable state achieved
            currentFee = recomputedFee;
            changeAmount = inputsTotal - targetSompi - currentFee;
            break;
        }

        // Needs more inputs to cover the fee increase
        currentFee = recomputedFee;
    }

    // 6. Change Calculation
    let changeOutput: Output | undefined = undefined;
    if (changeAmount > 0n) {
        if (changeAmount < DUST_THRESHOLD_SOMPI) {
            // Dust absorption: Add to miner fee
            currentFee += changeAmount;
            changeAmount = 0n;
        } else {
            changeOutput = {
                address: config.context.changeAddress,
                amountSompi: changeAmount.toString()
            };
        }
    }

    // 7. Assemble TxPlan
    // Generating a basic unsigned payload summary JSON for now
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
        unsignedPayload: JSON.stringify(planSummary)
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
