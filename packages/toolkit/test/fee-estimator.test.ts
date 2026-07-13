import { describe, it, expect, vi } from 'vitest';
import { WalletToolkit } from '../src/wallet.js';

describe('WalletToolkit Fee Estimation', () => {
    it('should use dynamic fee estimator and return full evidence payload', async () => {
        const mockRpc = {
            getInfo: vi.fn().mockResolvedValue({ mempoolSize: 15000 })
        };
        const wallet = WalletToolkit.open("test-fees", { rpc: mockRpc, storePath: "mem://test1" });
        vi.spyOn(wallet, 'receive').mockResolvedValue('kaspatest:qdummy');

        // Mock utxos so it can build a plan
        vi.spyOn(wallet.utxos, 'list').mockResolvedValue([{
            outpoint: { transactionId: "tx1", index: 0 },
            amountSompi: 100000000n,
            scriptPublicKey: "mockscript",
            isCoinbase: false,
            address: "kaspatest:qdummy"
        } as any]);

        const result = await wallet.estimateFee({ to: "kaspatest:qdest", amount: 1000n, priority: "normal" });
        
        expect(result.evidence).toBe("dynamic");
        expect(result.feeRate).toBe(4n); // normal (2n) * dynamic multiplier for 15k mempool (2n)
        expect(result.mempoolSize).toBe(15000);
        expect(result.estimatedMass).toBeGreaterThan(0n);
        expect(result.fee).toBe(result.estimatedMass * 4n);
        expect(result.totalOut).toBe(1000n + result.fee);
        expect(result.plan).toBeDefined();
    });
});
