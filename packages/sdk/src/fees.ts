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
      // Standard mempool relay policy floor (100 sompi per mass/compute gram)
      // We apply standard relay fee of 100 as minimum for all networks, as required by nodes.
      const minimumNetworkFeeRate = 100n;

      const dynamic = await calculateDynamicFeeRate(this.sdk.rpc, options.priority, minimumNetworkFeeRate);
      
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
        // Strict policy formula: 100 sompi * max(compute_grams, 2 * transaction_bytes)
        const computeMassForFloor = internalComputeGrams > (massResult.txBytes * 2n) ? internalComputeGrams : (massResult.txBytes * 2n);
        const minimumToccataFee = minimumNetworkFeeRate * computeMassForFloor;
        
        const priorityFee = estimateFeeFromMass(massResult.mass, dynamic.feeRate);
        estimatedFee = minimumToccataFee > priorityFee ? minimumToccataFee : priorityFee;
      } else {
        // V0 legacy fee path
        const computeMassForFloor = massResult.mass;
        const minimumV0Fee = minimumNetworkFeeRate * computeMassForFloor;
        const priorityFee = estimateFeeFromMass(massResult.mass, dynamic.feeRate);
        estimatedFee = minimumV0Fee > priorityFee ? minimumV0Fee : priorityFee;
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
