import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WalletToolkit } from '../src/wallet.js';

class FakeJsonRpcClient {
    private subs = new Set<(data: any) => void>();
    public isClosed = false;

    constructor(public options: any) {}

    async getInfo() {
        if (this.isClosed) throw new Error("Closed");
        return { networkId: "simnet" };
    }

    async subscribeToUtxosChanged(addresses: readonly string[], cb: (data: any) => void) {
        if (this.isClosed) throw new Error("Closed");
        this.subs.add(cb);
        let closed = false;
        return {
            id: "fake_sub",
            get closed() { return closed; },
            unsubscribe: async () => {
                this.subs.delete(cb);
                closed = true;
            }
        };
    }

    async close() {
        this.isClosed = true;
    }

    simulateEvent(topic: string, data: any) {
        for (const cb of this.subs) {
            cb(data);
        }
    }

    simulateDisconnect() {
        this.isClosed = true;
        if (this.options.onDisconnect) {
            this.options.onDisconnect();
        }
    }
}

describe('Wallet Subscription Subsystem', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    it('should deduplicate raw events into 1 wallet event', async () => {
        const fakeRpc = new FakeJsonRpcClient({});
        const wallet = WalletToolkit.open("test-dedupe", { rpc: fakeRpc, storePath: "mem://test1" });
        vi.spyOn(wallet, 'receive').mockResolvedValue('kaspatest:qdummy');

        const handler = vi.fn();
        const { unwatch } = await wallet.watch(handler);

        // Simulate duplicate events with same txid
        const eventData = {
            added: [{ outpoint: { transactionId: "tx-123", index: 0 } }]
        };

        fakeRpc.simulateEvent("utxos-changed", eventData);
        fakeRpc.simulateEvent("utxos-changed", eventData);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(expect.objectContaining({
            type: "transaction",
            txid: "tx-123"
        }));

        await unwatch();
    });

    it('should stop receiving callbacks after unwatch', async () => {
        const fakeRpc = new FakeJsonRpcClient({});
        const wallet = WalletToolkit.open("test-unwatch", { rpc: fakeRpc, storePath: "mem://test3" });
        vi.spyOn(wallet, 'receive').mockResolvedValue('kaspatest:qdummy');

        const handler = vi.fn();
        const { unwatch } = await wallet.watch(handler);

        fakeRpc.simulateEvent("utxos-changed", { added: [{ outpoint: { transactionId: "tx-111" } }] });
        expect(handler).toHaveBeenCalledTimes(1);

        await unwatch();

        fakeRpc.simulateEvent("utxos-changed", { added: [{ outpoint: { transactionId: "tx-222" } }] });
        expect(handler).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should survive if callback throws', async () => {
        const fakeRpc = new FakeJsonRpcClient({});
        const wallet = WalletToolkit.open("test-throw", { rpc: fakeRpc, storePath: "mem://test4" });
        vi.spyOn(wallet, 'receive').mockResolvedValue('kaspatest:qdummy');

        let calls = 0;
        const handler = vi.fn((event) => {
            calls++;
            if (calls === 1) throw new Error("Boom");
        });

        const { unwatch } = await wallet.watch(handler);

        fakeRpc.simulateEvent("utxos-changed", { added: [{ outpoint: { transactionId: "tx-aaa" } }] });
        expect(calls).toBe(1);

        fakeRpc.simulateEvent("utxos-changed", { added: [{ outpoint: { transactionId: "tx-bbb" } }] });
        expect(calls).toBe(2);

        await unwatch();
    });
});
