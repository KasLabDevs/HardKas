import { Hardkas } from "./index.js";
import { calculateDynamicFeeRate, FeePriority } from "@hardkas/toolkit";
import {
  estimateTransactionMass,
  estimateFeeFromMass,
  resolveMaxFeeRate,
  MINIMUM_RELAY_FEE_RATE_SOMPI_PER_GRAM
} from "@hardkas/tx-builder";

/**
 * HardKAS Fees Module
 * @alpha
 */
export class HardkasFees {
  constructor(private sdk: Hardkas) {}

  /**
   * Estimates the fee rate (sompi per gram) for a priority from the node's fee estimate (HK-09).
   *
   * - The node's `getFeeEstimate` answer (`{ estimate: { priorityBucket, normalBuckets, lowBuckets } }`) is read in that
   *   shape; the bucket follows the priority (fast / normal / slow). Never below the relay minimum (100 sompi/gram).
   * - A node's rate above `maxFeeRate` (option, else `networks[<net>].maxFeeRate`, else 10,000) is refused with
   *   FEE_RATE_ABOVE_BOUND (CA-TX-01).
   * - `evidence` is "dynamic" only when the node's estimate was read and used ("heuristic" = the relay minimum).
   *
   * The mass and fee here are a SHAPE estimate (no amounts, hence no storage mass): plans are priced by the Generator over
   * the real transaction. At the relay minimum the estimated fee is the minimum for the shape's compute mass.
   */
  async estimate(options: {
    priority: FeePriority,
    inputs: number | readonly any[],
    outputs: number | readonly any[],
    network?: string,
    version?: 0 | 1,
    computeGrams?: bigint,
    computeBudget?: bigint,
    /** CA-TX-01: upper bound on the node's rate, sompi per gram. */
    maxFeeRate?: bigint
  }): Promise<{
    feeRate: bigint;
    estimatedMass: bigint;
    estimatedFee: bigint;
    evidence: "dynamic" | "heuristic";
    mempoolSize?: number | undefined;
    source: "node-estimate" | "network-minimum";
    nodeFeeRate?: number | undefined;
  }> {
      const network = options.network ?? (this.sdk as any).network;
      const maxFeeRate = resolveMaxFeeRate({ override: options.maxFeeRate, config: (this.sdk as any).config?.config, network });
      const dynamic = await calculateDynamicFeeRate(this.sdk.rpc, options.priority, MINIMUM_RELAY_FEE_RATE_SOMPI_PER_GRAM, { maxFeeRate });

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

      // FEE-POLICY-1: only a rate above the relay minimum adds a priority fee; at the minimum the fee is the minimum
      const priorityFee = dynamic.feeRate > MINIMUM_RELAY_FEE_RATE_SOMPI_PER_GRAM ? estimateFeeFromMass(massResult.mass, dynamic.feeRate) : 0n;
      const estimatedFee = priorityFee > massResult.feeSompi ? priorityFee : massResult.feeSompi;

      return {
          feeRate: dynamic.feeRate,
          estimatedMass: massResult.mass,
          estimatedFee,
          evidence: dynamic.evidence,
          source: dynamic.source,
          ...(dynamic.nodeFeeRate !== undefined ? { nodeFeeRate: dynamic.nodeFeeRate } : {}),
          ...(dynamic.mempoolSize !== undefined ? { mempoolSize: dynamic.mempoolSize } : {})
      };
  }
}
