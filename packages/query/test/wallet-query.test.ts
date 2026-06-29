import { describe, it, expect } from "vitest";
import { WalletQuery, WalletQueryProvider } from "../src/wallet-query.js";

class MockProvider implements WalletQueryProvider {
    source = "mock" as const;
    shouldFail = false;

    async getBalances(addresses: string[]) {
        if (this.shouldFail) throw new Error("Connection lost");
        const balances: Record<string, bigint> = {};
        for (const addr of addresses) {
            if (addr === "addr1") balances[addr] = 1000n;
            else if (addr === "addr2") balances[addr] = 2000n;
            else balances[addr] = 0n;
        }
        return balances;
    }

    async getUtxos(addresses: string[]) {
        if (this.shouldFail) throw new Error("Connection lost");
        const utxos: Record<string, any[]> = {};
        for (const addr of addresses) {
            if (addr === "addr1") utxos[addr] = [{ transactionId: "tx1", outputIndex: 0, amountSompi: 1000n, scriptPublicKey: "script1", address: addr }];
            else utxos[addr] = [];
        }
        return utxos;
    }

    async getHistory(args: { addresses: string[], limit?: number, cursor?: string }) {
        if (this.shouldFail) throw new Error("Connection lost");
        return {
            items: [
                { txId: "tx1", timestamp: 1000000, amountSompi: 1000n, isSend: false }
            ],
            nextCursor: "cursor_1"
        };
    }
}

describe("WalletQuery", () => {
    it("empty wallet balance = 0", async () => {
        const query = new WalletQuery({ provider: new MockProvider() });
        const res = await query.getBalance(["empty1", "empty2"]);
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.balanceSompi).toBe(0n);
            expect(res.addressesScanned).toBe(2);
        }
    });

    it("multiple addresses aggregated", async () => {
        const query = new WalletQuery({ provider: new MockProvider() });
        const res = await query.getBalance(["addr1", "addr2", "empty1"]);
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.balanceSompi).toBe(3000n);
            expect(res.addressesScanned).toBe(3);
        }
    });

    it("UTXOs grouped by address", async () => {
        const query = new WalletQuery({ provider: new MockProvider() });
        const res = await query.getUtxos(["addr1", "empty1"]);
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.utxos["addr1"].length).toBe(1);
            expect(res.utxos["empty1"].length).toBe(0);
        }
    });

    it("history paginated", async () => {
        const query = new WalletQuery({ provider: new MockProvider() });
        const res = await query.getHistory({ addresses: ["addr1"], limit: 10 });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.history.items.length).toBe(1);
            expect(res.history.nextCursor).toBe("cursor_1");
        }
    });

    it("query-store unavailable -> structured degraded result", async () => {
        const provider = new MockProvider();
        provider.shouldFail = true;
        const query = new WalletQuery({ provider });
        
        const res = await query.getBalance(["addr1"]);
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.status).toBe("DEGRADED");
            expect(res.code).toBe("WALLET_QUERY_PROVIDER_UNAVAILABLE");
            expect(res.source).toBe("mock");
        }
    });

    it("no forbidden claims", async () => {
        const query = new WalletQuery({ provider: new MockProvider() });
        const res = await query.getBalance(["addr1"]);
        if (res.ok) {
            expect(res.claims.completeHistoricalIndex).toBe(false);
            expect(res.claims.productionIndexer).toBe(false);
        }
    });
    
    it("mainnet blocked by default", () => {
        expect(() => new WalletQuery({ provider: new MockProvider(), network: "mainnet" })).toThrow(/WALLET_QUERY_MAINNET_BLOCKED/);
    });
});
