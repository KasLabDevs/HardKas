import { Hardkas } from "./index.js";
import { calculateDynamicFeeRate, FeePriority } from "@hardkas/toolkit";
import { estimateTransactionMass, estimateFeeFromMass } from "@hardkas/tx-builder";

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
      // Floor for the dynamic rate (sompi per gram); the fee itself can never go
      // below the minimum the SDK computes for the transaction's mass.
      const minimumNetworkFeeRate = 100n;

      const dynamic = await calculateDynamicFeeRate(this.sdk.rpc, options.priority, minimumNetworkFeeRate);

      // Mass and minimum fee from the pinned SDK (v0 and v1 alike). kaspa-wasm
      // 2.0.x does not charge computeBudget, so no HardKAS compute formula is applied.
      const massResult = estimateTransactionMass({
          inputCount: typeof options.inputs === "number" ? options.inputs : options.inputs.length,
          outputs: typeof options.outputs === "number"
                    ? Array(options.outputs).fill({ address: "kaspatest:qdummy" })
                    : options.outputs,
          hasChange: true,
          version: options.version ?? 0,
          ...(options.network ? { networkId: options.network } : {})
      });

      const priorityFee = estimateFeeFromMass(massResult.mass, dynamic.feeRate);
      const estimatedFee = priorityFee > massResult.feeSompi ? priorityFee : massResult.feeSompi;

      return {
          feeRate: dynamic.feeRate,
          estimatedMass: massResult.mass,
          estimatedFee,
          evidence: dynamic.evidence,
          ...(dynamic.mempoolSize !== undefined ? { mempoolSize: dynamic.mempoolSize } : {})
      };
  }
}
