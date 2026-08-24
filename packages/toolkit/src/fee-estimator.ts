import { KaspaRpcClient } from '@hardkas/kaspa-rpc';

export type FeePriority = "slow" | "normal" | "fast";

export interface DynamicFeeRateResult {
    feeRate: bigint;
    evidence: "dynamic" | "heuristic";
    mempoolSize?: number | undefined;
}

export async function calculateDynamicFeeRate(
    rpc: KaspaRpcClient | undefined,
    priority: FeePriority,
    minimumNetworkFeeRate: bigint = 0n // E.g., 100n for Toccata standardness policy
): Promise<DynamicFeeRateResult> {
    const feeFloor = priority === "slow" ? 1n : priority === "normal" ? 2n : 5n;
    let dynamicMempoolMultiplier = 1n;
    let evidence: "dynamic" | "heuristic" = "heuristic";
    let mempoolSize: number | undefined = undefined;
    let rpcFeeRate: bigint | undefined = undefined;

    if (rpc && rpc.getInfo) {
        try {
            // First check if node has explicit fee estimate API (e.g. GetFeeEstimate)
            if (typeof (rpc as any).getFeeEstimate === 'function') {
                const estimate = await (rpc as any).getFeeEstimate();
                if (estimate && estimate.priorityBucket && estimate.priorityBucket.feerate) {
                    rpcFeeRate = BigInt(Math.floor(estimate.priorityBucket.feerate));
                }
            } else if (typeof (rpc as any).getFeeEstimateExperimental === 'function') {
                const estimate = await (rpc as any).getFeeEstimateExperimental();
                if (estimate && estimate.priorityBucket && estimate.priorityBucket.feerate) {
                    rpcFeeRate = BigInt(Math.floor(estimate.priorityBucket.feerate));
                }
            }

            const info = await rpc.getInfo();
            mempoolSize = info.mempoolSize;
            
            // Dynamic heuristics based on mempool size
            if (mempoolSize !== undefined) {
                if (mempoolSize > 10000) {
                    dynamicMempoolMultiplier = priority === "slow" ? 1n : 2n;
                }
                if (mempoolSize > 50000) {
                    dynamicMempoolMultiplier = priority === "slow" ? 2n : priority === "normal" ? 5n : 10n;
                }
            }
            evidence = "dynamic";
        } catch (err) {
            // Graceful fallback to heuristic if RPC is unreachable or fails
            evidence = "heuristic";
        }
    }

    let computedRate = rpcFeeRate;
    if (computedRate === undefined) {
        computedRate = feeFloor * dynamicMempoolMultiplier;
    }

    // Clamp against the mempool/standardness network policy (not consensus).
    // E.g., Toccata localnet requires 100 sompi/mass minimum standardness relay fee.
    if (computedRate < minimumNetworkFeeRate) {
        computedRate = minimumNetworkFeeRate;
    }

    return {
        feeRate: computedRate,
        evidence,
        ...(mempoolSize !== undefined ? { mempoolSize } : {})
    };
}
