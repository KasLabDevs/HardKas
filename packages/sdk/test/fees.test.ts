import { describe, it, expect, vi } from 'vitest';
import { Hardkas } from '../src/index.js';
import { KaspaRpcClient } from '@hardkas/kaspa-rpc';

describe('HardkasFees', () => {
    // The fee rate is the node's own estimate (getFeeEstimate: priorityBucket / normalBuckets[0] / lowBuckets[0]), read
    // from a real simnet node (rusty-kaspad 2.1.0) and mirrored here. The mempool size no longer scales the rate: it is
    // reported for information only (the node's estimate already reflects congestion).
    const nodeAnswer = (priority: number, normal: number, low: number) => ({
        estimate: {
            priorityBucket: { feerate: priority, estimatedSeconds: 0.0004 },
            normalBuckets: [{ feerate: normal, estimatedSeconds: 0.0004 }, { feerate: normal, estimatedSeconds: 0.0004 }],
            lowBuckets: [{ feerate: low, estimatedSeconds: 0.0004 }]
        }
    });

    it('an idle node (the real simnet answer: 100 at every priority) gives the relay minimum as a dynamic, node-sourced estimate', async () => {
        const mockRpc = {
            getFeeEstimate: vi.fn().mockResolvedValue(nodeAnswer(100, 100, 100)),
            getInfo: vi.fn().mockResolvedValue({ mempoolSize: 0 })
        } as unknown as KaspaRpcClient;
        const { HardkasFees } = await import('../src/fees.js');
        const fees = new HardkasFees({ rpc: mockRpc } as any);

        const res = await fees.estimate({ priority: "normal", inputs: 1, outputs: 2 });
        expect(res.evidence).toBe("dynamic");
        expect(res.source).toBe("node-estimate");
        expect(res.feeRate).toBe(100n);
        expect(res.mempoolSize).toBe(0);
        expect(res.estimatedMass).toBeGreaterThan(0n);
        // at the relay minimum the estimated fee is the minimum for the shape's compute mass
        expect(res.estimatedFee).toBeGreaterThan(0n);
    });

    it('a congested node: each priority reads its own bucket, and the mempool size does not scale the rate', async () => {
        const mockRpc = {
            getFeeEstimate: vi.fn().mockResolvedValue(nodeAnswer(900, 400, 150)),
            getInfo: vi.fn().mockResolvedValue({ mempoolSize: 60000 })
        } as unknown as KaspaRpcClient;
        const { HardkasFees } = await import('../src/fees.js');
        const fees = new HardkasFees({ rpc: mockRpc } as any);

        const fast = await fees.estimate({ priority: "fast", inputs: 1, outputs: 2 });
        const normal = await fees.estimate({ priority: "normal", inputs: 1, outputs: 2 });
        const slow = await fees.estimate({ priority: "slow", inputs: 1, outputs: 2 });
        expect([fast.feeRate, normal.feeRate, slow.feeRate]).toEqual([900n, 400n, 150n]);
        expect(fast.evidence).toBe("dynamic");
        expect(fast.mempoolSize).toBe(60000);
        // a faster priority never costs less than a slower one for the same shape
        expect(fast.estimatedFee >= normal.estimatedFee && normal.estimatedFee >= slow.estimatedFee).toBe(true);
    });

    it('a rate above the configured bound is refused, never planned on', async () => {
        const mockRpc = {
            getFeeEstimate: vi.fn().mockResolvedValue(nodeAnswer(50_000, 50_000, 50_000))
        } as unknown as KaspaRpcClient;
        const { HardkasFees } = await import('../src/fees.js');
        const fees = new HardkasFees({ rpc: mockRpc } as any);

        await expect(fees.estimate({ priority: "fast", inputs: 1, outputs: 2 })).rejects.toMatchObject({ code: "FEE_RATE_ABOVE_BOUND" });
    });
    it('should gracefully fallback to heuristic when RPC fails', async () => {
        const mockRpc = {
            getInfo: vi.fn().mockRejectedValue(new Error("RPC unreachable"))
        } as unknown as KaspaRpcClient;
        
        const mockSdk = { rpc: mockRpc } as any;
        const { HardkasFees } = await import('../src/fees.js');
        const fees = new HardkasFees(mockSdk);

        const res = await fees.estimate({ priority: "fast", inputs: 1, outputs: 2 });
        expect(res.evidence).toBe("heuristic");
        expect(res.feeRate).toBe(100n); // fallback to fast base
        expect(res.mempoolSize).toBeUndefined();
    });
});
