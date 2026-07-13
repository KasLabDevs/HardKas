import { KaspaRpcClient } from '@hardkas/kaspa-rpc';

export type FeePriority = "slow" | "normal" | "fast";

export interface DynamicFeeRateResult {
    feeRate: bigint;
    evidence: "dynamic" | "heuristic";
    mempoolSize?: number | undefined;
}

export async function calculateDynamicFeeRate(
    rpc: KaspaRpcClient | undefined,
    priority: FeePriority
): Promise<DynamicFeeRateResult> {
    const feeFloor = priority === "slow" ? 1n : priority === "normal" ? 2n : 5n;
    let dynamicMempoolMultiplier = 1n;
    let evidence: "dynamic" | "heuristic" = "heuristic";
    let mempoolSize: number | undefined = undefined;

    if (rpc && rpc.getInfo) {
        try {
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

    return {
        feeRate: feeFloor * dynamicMempoolMultiplier,
        evidence,
        ...(mempoolSize !== undefined ? { mempoolSize } : {})
    };
}
