import { describe, it, expect, vi } from 'vitest';
import { Hardkas } from '../src/index.js';
import { KaspaRpcClient } from '@hardkas/kaspa-rpc';

describe('HardkasFees', () => {
    it('should return dynamic fees when mempool size is low', async () => {
        const mockRpc = {
            getInfo: vi.fn().mockResolvedValue({ mempoolSize: 0 })
        } as unknown as KaspaRpcClient;
        
        // Use the open constructor with mocked RPC
        // Wait, Hardkas is complex to instantiate just for tests. We can mock calculateDynamicFeeRate or just instantiate HardkasFees directly if we mock the sdk.
        const mockSdk = { rpc: mockRpc } as any;
        const { HardkasFees } = await import('../src/fees.js');
        const fees = new HardkasFees(mockSdk);

        const res = await fees.estimate({ priority: "normal", inputs: 1, outputs: 2 });
        expect(res.evidence).toBe("dynamic");
        expect(res.feeRate).toBe(2n);
        expect(res.mempoolSize).toBe(0);
        expect(res.estimatedMass).toBeGreaterThan(0n);
        expect(res.estimatedFee).toBe(res.estimatedMass * 2n);
    });

    it('should scale fee rates dynamically when mempool is congested', async () => {
        const mockRpc = {
            getInfo: vi.fn().mockResolvedValue({ mempoolSize: 60000 })
        } as unknown as KaspaRpcClient;
        
        const mockSdk = { rpc: mockRpc } as any;
        const { HardkasFees } = await import('../src/fees.js');
        const fees = new HardkasFees(mockSdk);

        const resNormal = await fees.estimate({ priority: "normal", inputs: 1, outputs: 2 });
        expect(resNormal.evidence).toBe("dynamic");
        expect(resNormal.feeRate).toBe(10n); // 2n (base) * 5n (multiplier)

        const resFast = await fees.estimate({ priority: "fast", inputs: 1, outputs: 2 });
        expect(resFast.feeRate).toBe(50n); // 5n (base) * 10n (multiplier)
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
        expect(res.feeRate).toBe(5n); // fallback to fast base
        expect(res.mempoolSize).toBeUndefined();
    });
});
