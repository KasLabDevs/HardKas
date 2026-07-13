import { Hardkas } from "./index.js";
import { calculateDynamicFeeRate, FeePriority } from "@hardkas/toolkit";
import { estimateTransactionMass, estimateFeeFromMass, estimateToccataFee } from "@hardkas/tx-builder";

/**
 * HardKAS Fees Module
 * @alpha
 */
export class HardkasFees {
  constructor(private sdk: Hardkas) {}

  /**
   * Estimates the optimal fee rate (sompi per mass) based on priority.
   * Dynamically checks mempoolSize for congestion and calculates tx mass exactly.
   * 
   * Supports both V0 (legacy mass-based) and V1 (Toccata compute-based) fee routing.
   */
  async estimate(options: { 
    priority: FeePriority, 
    inputs: number | readonly any[], 
    outputs: number | readonly any[], 
    network?: string,
    version?: 0 | 1,
    computeGrams?: bigint,
    computeBudget?: bigint
  }): Promise<{
    feeRate: bigint;
    estimatedMass: bigint;
    estimatedFee: bigint;
    evidence: "dynamic" | "heuristic";
    mempoolSize?: number | undefined;
  }> {
      const dynamic = await calculateDynamicFeeRate(this.sdk.rpc, options.priority);
      
      const massResult = estimateTransactionMass({
          inputCount: typeof options.inputs === "number" ? options.inputs : options.inputs.length,
          outputs: typeof options.outputs === "number" 
                    ? Array(options.outputs).fill({ address: "kaspatest:qdummy" })
                    : options.outputs,
          hasChange: true 
      });

      const version = options.version ?? 0;
      let estimatedFee: bigint;

      if (version === 1) {
        // Toccata fee path
        const internalComputeGrams = options.computeGrams ?? options.computeBudget ?? 0n;
        const minimumToccataFee = estimateToccataFee(internalComputeGrams, massResult.mass, massResult.txBytes);
        
        // Fee rate in Toccata applies to the compute budget/mass, but for now we enforce the minimum floor policy
        // If the priority-driven legacy dynamic fee is higher, we might take the max of both,
        // but the strict policy says: 100 sompi * max(compute_grams, 2 * transaction_bytes)
        const priorityFee = estimateFeeFromMass(massResult.mass, dynamic.feeRate);
        estimatedFee = minimumToccataFee > priorityFee ? minimumToccataFee : priorityFee;
      } else {
        // V0 legacy fee path
        estimatedFee = estimateFeeFromMass(massResult.mass, dynamic.feeRate);
      }

      return {
          feeRate: dynamic.feeRate,
          estimatedMass: massResult.mass,
          estimatedFee,
          evidence: dynamic.evidence,
          ...(dynamic.mempoolSize !== undefined ? { mempoolSize: dynamic.mempoolSize } : {})
      };
  }
}
