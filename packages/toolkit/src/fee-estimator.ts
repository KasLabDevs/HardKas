import { KaspaRpcClient } from '@hardkas/kaspa-rpc';
import {
    MINIMUM_RELAY_FEE_RATE_SOMPI_PER_GRAM,
    assertFeeRateWithinBound,
    resolveMaxFeeRate
} from '@hardkas/tx-builder';

export type FeePriority = "slow" | "normal" | "fast";

export interface DynamicFeeRateResult {
    /** The fee rate (sompi/gram) to plan with: the node's estimate for the priority, never below the floor. */
    feeRate: bigint;
    /** "dynamic" only when the node's fee estimate was read and the rate comes from it; otherwise "heuristic". */
    evidence: "dynamic" | "heuristic";
    mempoolSize?: number | undefined;
    /** Where the rate comes from: the node's estimate, or the network minimum (no usable estimate). */
    source: "node-estimate" | "network-minimum";
    /** The bucket feerate the node answered, when one was read. */
    nodeFeeRate?: number | undefined;
    /** Which bucket was read: priority (fast), normal or low (slow). */
    bucket?: "priority" | "normal" | "low" | undefined;
}

export interface DynamicFeeRateOptions {
    /** Upper bound on a node-supplied rate (sompi/gram); above it FEE_RATE_ABOVE_BOUND. Default 10,000. */
    maxFeeRate?: bigint | undefined;
}

type Bucket = { feerate?: unknown } | undefined;

/** A bucket's feerate when it is a finite, non-negative number; undefined otherwise (malformed answers are not used). */
function feerateOf(bucket: Bucket): number | undefined {
    const f = bucket?.feerate;
    return typeof f === "number" && Number.isFinite(f) && f >= 0 ? f : undefined;
}

/**
 * HK-09 / CA-TX-01 · the fee rate to plan with, from the node's fee estimate.
 *
 * - The answer of `getFeeEstimate` is `{ estimate: { priorityBucket, normalBuckets, lowBuckets } }` (kaspa-wasm 2.1.0
 *   `IGetFeeEstimateResponse`, the official RpcClient through @hardkas/kaspa-rpc); a flat `{ priorityBucket, ... }` from
 *   an injected client is read the same way. The bucket follows the priority: fast → `priorityBucket`, normal →
 *   `normalBuckets[0]`, slow → `lowBuckets[0]` (a missing bucket falls back to the next faster one).
 * - The rate is the bucket's feerate rounded up, never below `minimumNetworkFeeRate` nor the relay minimum
 *   (100 sompi/gram); at that floor the planner pays the relay minimum (FEE-POLICY-1 in @hardkas/tx-builder).
 * - A node's answer is untrusted: a rate above `maxFeeRate` (default 10,000 sompi/gram) is refused with
 *   FEE_RATE_ABOVE_BOUND; a malformed one is not used.
 * - `evidence` is "dynamic" only when the node's estimate was read and used; with no client, no `getFeeEstimate`, a
 *   failed or malformed answer, it is "heuristic" and the rate is the floor. The mempool size (getInfo) is reported
 *   for information only: it no longer scales the rate (the node's estimate already reflects congestion).
 */
export async function calculateDynamicFeeRate(
    rpc: KaspaRpcClient | undefined,
    priority: FeePriority,
    minimumNetworkFeeRate: bigint = MINIMUM_RELAY_FEE_RATE_SOMPI_PER_GRAM,
    options: DynamicFeeRateOptions = {}
): Promise<DynamicFeeRateResult> {
    const floor = minimumNetworkFeeRate > MINIMUM_RELAY_FEE_RATE_SOMPI_PER_GRAM ? minimumNetworkFeeRate : MINIMUM_RELAY_FEE_RATE_SOMPI_PER_GRAM;
    const maxFeeRate = resolveMaxFeeRate({ override: options.maxFeeRate });
    let mempoolSize: number | undefined;
    let nodeFeeRate: number | undefined;
    let bucket: DynamicFeeRateResult["bucket"];

    const client = rpc as any;
    if (client) {
        let answer: any;
        try {
            if (typeof client.getFeeEstimate === "function") answer = await client.getFeeEstimate();
            else if (typeof client.getFeeEstimateExperimental === "function") answer = await client.getFeeEstimateExperimental();
        } catch {
            answer = undefined; // unreachable or failing node: no estimate, the floor applies
        }
        const estimate = answer?.estimate ?? answer;
        if (estimate && typeof estimate === "object") {
            const priorityBucket = feerateOf(estimate.priorityBucket);
            const normal = Array.isArray(estimate.normalBuckets) ? feerateOf(estimate.normalBuckets[0]) : undefined;
            const low = Array.isArray(estimate.lowBuckets) ? feerateOf(estimate.lowBuckets[0]) : undefined;
            if (priority === "fast") {
                nodeFeeRate = priorityBucket;
                bucket = "priority";
            } else if (priority === "normal") {
                nodeFeeRate = normal ?? priorityBucket;
                bucket = normal !== undefined ? "normal" : "priority";
            } else {
                nodeFeeRate = low ?? normal ?? priorityBucket;
                bucket = low !== undefined ? "low" : normal !== undefined ? "normal" : "priority";
            }
            if (nodeFeeRate === undefined) bucket = undefined;
        }
        if (typeof client.getInfo === "function") {
            try {
                const info = await client.getInfo();
                if (typeof info?.mempoolSize === "number") mempoolSize = info.mempoolSize;
            } catch {
                // informational only
            }
        }
    }

    if (nodeFeeRate === undefined) {
        return { feeRate: floor, evidence: "heuristic", source: "network-minimum", ...(mempoolSize !== undefined ? { mempoolSize } : {}) };
    }
    const rate = BigInt(Math.ceil(nodeFeeRate));
    assertFeeRateWithinBound(rate, maxFeeRate, `the node's fee estimate (${bucket} bucket)`);
    return {
        feeRate: rate > floor ? rate : floor,
        evidence: "dynamic",
        source: "node-estimate",
        nodeFeeRate,
        bucket,
        ...(mempoolSize !== undefined ? { mempoolSize } : {})
    };
}
