import { describe, it, expect, vi } from 'vitest';
import { WalletToolkit } from '../src/wallet.js';
import { loadManagedKaspaWasmSync } from '@hardkas/core';

// M10-B-completion (A′): the upstream Generator now owns coin-selection and
// address parsing, so the fixtures must be real bech32 addresses with valid
// scriptPublicKey payloads. Using a known-good simnet address and deriving its
// scriptPublicKey from the pinned SDK keeps the test hermetic without needing
// an RPC — the mempool/priority path is what this test actually exercises.
const FIXTURE_ADDRESS = 'kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw';
const FIXTURE_DEST = FIXTURE_ADDRESS; // send-to-self keeps scriptPublicKey identical

describe('WalletToolkit Fee Estimation', () => {
    it('should use dynamic fee estimator and return full evidence payload', async () => {
        const mockRpc = {
            getInfo: vi.fn().mockResolvedValue({ mempoolSize: 15000 })
        };
        const wallet = WalletToolkit.open("test-fees", { rpc: mockRpc, storePath: "mem://test1" });
        vi.spyOn(wallet, 'receive').mockResolvedValue(FIXTURE_ADDRESS);

        const k = loadManagedKaspaWasmSync();
        const spk = String(k.payToAddressScript(FIXTURE_ADDRESS).script);

        // Mock utxos so it can build a plan
        vi.spyOn(wallet.utxos, 'list').mockResolvedValue([{
            outpoint: { transactionId: "0".repeat(64), index: 0 },
            amountSompi: 10_000_000_000n,
            scriptPublicKey: spk,
            isCoinbase: false,
            address: FIXTURE_ADDRESS
        } as any]);

        const amount = 1_000_000_000n;
        const result = await wallet.estimateFee({ to: FIXTURE_DEST, amount, priority: "normal" });

        expect(result.evidence).toBe("dynamic");
        expect(result.feeRate).toBe(4n); // normal (2n) * dynamic multiplier for 15k mempool (2n)
        expect(result.mempoolSize).toBe(15000);
        expect(result.estimatedMass).toBeGreaterThan(0n);
        // A rate of 4 sompi/gram is below the node's minimum (100 sompi/gram, per the
        // SDK): the fee is the minimum the node requires, never mass * 4.
        expect(result.fee).toBe(result.estimatedMass * 100n);
        expect(result.totalOut).toBe(amount + result.fee);
        expect(result.plan).toBeDefined();
    });
});
