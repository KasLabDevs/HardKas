import { describe, it, expect } from "vitest";
import { checkPaymentStatus } from "../src/payment-tracker.js";
import { WalletQuery, WalletQueryProvider } from "../src/wallet-query.js";
import type { Utxo } from "@hardkas/core";

// Dummy provider for testing
class MockProvider implements WalletQueryProvider {
    constructor(private utxos: Record<string, Utxo[]>) {}
    
    async getBalances(addresses: string[]) { return {}; }
    
    async getUtxos(addresses: string[]) {
        const result: Record<string, Utxo[]> = {};
        for (const addr of addresses) {
            if (this.utxos[addr]) result[addr] = this.utxos[addr];
        }
        return result;
    }
    
    async getHistory(args: any) { return { items: [] }; }
}

describe("PaymentTracker", () => {
    it("returns not_found when no UTXOs exist", async () => {
        const queryEngine = new WalletQuery({ provider: new MockProvider({}) });
        
        const res = await checkPaymentStatus({
            address: "kaspatest:qqabc",
            expectedAmountSompi: 1000n,
            requiredConfirmations: 0,
            queryEngine
        });
        
        expect(res.status).toBe("not_found");
        expect(res.amountFoundSompi).toBe(0n);
    });

    it("returns partially_paid when amount is insufficient", async () => {
        const utxos = [
            { transactionId: "tx1", outputIndex: 0, address: "kaspatest:qqabc", amountSompi: 500n, scriptPublicKey: "" }
        ];
        const queryEngine = new WalletQuery({ provider: new MockProvider({ "kaspatest:qqabc": utxos }) });
        
        const res = await checkPaymentStatus({
            address: "kaspatest:qqabc",
            expectedAmountSompi: 1000n,
            requiredConfirmations: 0,
            queryEngine
        });
        
        expect(res.status).toBe("partially_paid");
        expect(res.amountFoundSompi).toBe(500n);
    });

    it("returns mempool when amount is sufficient but confirmations are lacking", async () => {
        const utxos = [
            { transactionId: "tx1", outputIndex: 0, address: "kaspatest:qqabc", amountSompi: 1000n, scriptPublicKey: "", confirmations: 5 }
        ];
        const queryEngine = new WalletQuery({ provider: new MockProvider({ "kaspatest:qqabc": utxos }) });
        
        const res = await checkPaymentStatus({
            address: "kaspatest:qqabc",
            expectedAmountSompi: 1000n,
            requiredConfirmations: 10,
            queryEngine
        });
        
        expect(res.status).toBe("mempool");
        expect(res.confirmations).toBe(5);
    });

    it("returns confirmed when amount and confirmations are sufficient", async () => {
        const utxos = [
            { transactionId: "tx1", outputIndex: 0, address: "kaspatest:qqabc", amountSompi: 1500n, scriptPublicKey: "", confirmations: 12 }
        ];
        const queryEngine = new WalletQuery({ provider: new MockProvider({ "kaspatest:qqabc": utxos }) });
        
        const res = await checkPaymentStatus({
            address: "kaspatest:qqabc",
            expectedAmountSompi: 1000n,
            requiredConfirmations: 10,
            queryEngine
        });
        
        expect(res.status).toBe("confirmed");
        expect(res.confirmations).toBe(12);
        expect(res.txId).toBe("tx1");
    });
    
    it("aggregates multiple UTXOs correctly", async () => {
        const utxos = [
            { transactionId: "tx1", outputIndex: 0, address: "kaspatest:qqabc", amountSompi: 600n, scriptPublicKey: "", confirmations: 20 },
            { transactionId: "tx2", outputIndex: 1, address: "kaspatest:qqabc", amountSompi: 400n, scriptPublicKey: "", confirmations: 5 }
        ];
        const queryEngine = new WalletQuery({ provider: new MockProvider({ "kaspatest:qqabc": utxos }) });
        
        const res = await checkPaymentStatus({
            address: "kaspatest:qqabc",
            expectedAmountSompi: 1000n,
            requiredConfirmations: 10,
            queryEngine
        });
        
        // Because the minimum confirmation among the UTXOs is 5, it should be mempool for required 10
        expect(res.status).toBe("mempool");
        expect(res.amountFoundSompi).toBe(1000n);
        expect(res.confirmations).toBe(5);
    });

    // G6 (notes cross-check): a coin with a covenant id (KIP-20) is not plain KAS. It used to be summed into the
    // payment, so a covenant's coin at the address could "pay" an invoice.
    it("G6: covenant-bound UTXOs are not counted as payment (both shapes), and are reported apart", async () => {
        const utxos: any[] = [
            { transactionId: "cov1", outputIndex: 0, address: "kaspatest:qqabc", amountSompi: 1000n, scriptPublicKey: "", covenantId: "aa".repeat(32), confirmations: 50 },
            { transactionId: "cov2", outputIndex: 0, address: "kaspatest:qqabc", amountSompi: 700n, scriptPublicKey: "", utxoEntry: { covenant_id: "bb".repeat(32) }, confirmations: 50 },
            { transactionId: "plain", outputIndex: 1, address: "kaspatest:qqabc", amountSompi: 400n, scriptPublicKey: "", confirmations: 50 }
        ];
        const queryEngine = new WalletQuery({ provider: new MockProvider({ "kaspatest:qqabc": utxos }) });
        const res = await checkPaymentStatus({ address: "kaspatest:qqabc", expectedAmountSompi: 1000n, requiredConfirmations: 10, queryEngine });
        expect(res.status).toBe("partially_paid");
        expect(res.amountFoundSompi).toBe(400n);
        expect(res.covenantBoundSompi).toBe(1700n);
        expect(res.covenantUtxoCount).toBe(2);
        expect(res.txIds).toEqual(["plain"]);
        expect(res.txId).toBe("plain");
    });

    it("G6: only covenant-bound coins at the address → not_found, never paid", async () => {
        const utxos: any[] = [
            { transactionId: "cov1", outputIndex: 0, address: "kaspatest:qqabc", amountSompi: 5000n, scriptPublicKey: "", covenantId: "cc".repeat(32), confirmations: 99 }
        ];
        const queryEngine = new WalletQuery({ provider: new MockProvider({ "kaspatest:qqabc": utxos }) });
        const res = await checkPaymentStatus({ address: "kaspatest:qqabc", expectedAmountSompi: 1000n, requiredConfirmations: 0, queryEngine });
        expect(res.status).toBe("not_found");
        expect(res.amountFoundSompi).toBe(0n);
        expect(res.txId).toBeUndefined();
        expect(res.txIds).toEqual([]);
    });

    it("G6: every paying transaction is recorded; txId is the one that paid most, not the first listed", async () => {
        const utxos: any[] = [
            { transactionId: "small", outputIndex: 0, address: "kaspatest:qqabc", amountSompi: 100n, scriptPublicKey: "", confirmations: 20 },
            { transactionId: "big", outputIndex: 0, address: "kaspatest:qqabc", amountSompi: 900n, scriptPublicKey: "", confirmations: 20 },
            { transactionId: "small", outputIndex: 1, address: "kaspatest:qqabc", amountSompi: 50n, scriptPublicKey: "", confirmations: 20 }
        ];
        const queryEngine = new WalletQuery({ provider: new MockProvider({ "kaspatest:qqabc": utxos }) });
        const res = await checkPaymentStatus({ address: "kaspatest:qqabc", expectedAmountSompi: 1000n, requiredConfirmations: 10, queryEngine });
        expect(res.status).toBe("confirmed");
        expect(res.amountFoundSompi).toBe(1050n);
        expect(res.txIds).toEqual(["small", "big"]);
        expect(res.txId).toBe("big");
        expect(res.outpoints.map((o) => `${o.transactionId}:${o.outputIndex}`)).toEqual(["small:0", "big:0", "small:1"]);
    });

    // G6: no RPC provider sets `confirmations`, so a paid invoice stayed "mempool" for ever. The depth is now derived from
    // what a node gives: the UTXO's blockDaaScore and the virtual DAA score the caller read.
    it("G6: depth derived from blockDaaScore and the caller's virtualDaaScore → confirmed, labelled daa-depth", async () => {
        const utxos: any[] = [
            { transactionId: "tx1", outputIndex: 0, address: "kaspatest:qqabc", amountSompi: 1000n, scriptPublicKey: "", blockDaaScore: 5_000_000n },
            { transactionId: "tx2", outputIndex: 0, address: "kaspatest:qqabc", amountSompi: 10n, scriptPublicKey: "", blockDaaScore: "5000040" }
        ];
        const queryEngine = new WalletQuery({ provider: new MockProvider({ "kaspatest:qqabc": utxos }) });
        const res = await checkPaymentStatus({ address: "kaspatest:qqabc", expectedAmountSompi: 1000n, requiredConfirmations: 50, queryEngine, virtualDaaScore: 5_000_100n });
        expect(res.status).toBe("confirmed");
        expect(res.confirmations).toBe(60);
        expect(res.depthKnown).toBe(true);
        expect(res.confirmationSource).toBe("daa-depth");
        const shallow = await checkPaymentStatus({ address: "kaspatest:qqabc", expectedAmountSompi: 1000n, requiredConfirmations: 100, queryEngine, virtualDaaScore: 5_000_100n });
        expect(shallow.status).toBe("mempool");
        expect(shallow.depthKnown).toBe(true);
    });

    it("G6: without a depth source the depth is labelled unknown (never 'confirmed' above 0 required)", async () => {
        const utxos: any[] = [
            { transactionId: "tx1", outputIndex: 0, address: "kaspatest:qqabc", amountSompi: 1000n, scriptPublicKey: "", blockDaaScore: 5_000_000n }
        ];
        const queryEngine = new WalletQuery({ provider: new MockProvider({ "kaspatest:qqabc": utxos }) });
        const res = await checkPaymentStatus({ address: "kaspatest:qqabc", expectedAmountSompi: 1000n, requiredConfirmations: 10, queryEngine });
        expect(res.status).toBe("mempool");
        expect(res.depthKnown).toBe(false);
        expect(res.confirmationSource).toBe("unknown");
        expect(res.confirmations).toBe(0);
    });

    it("provider confirmations keep their meaning and are labelled provider", async () => {
        const utxos: any[] = [{ transactionId: "tx1", outputIndex: 0, address: "kaspatest:qqabc", amountSompi: 1000n, scriptPublicKey: "", confirmations: 12, blockDaaScore: 1n }];
        const queryEngine = new WalletQuery({ provider: new MockProvider({ "kaspatest:qqabc": utxos }) });
        const res = await checkPaymentStatus({ address: "kaspatest:qqabc", expectedAmountSompi: 1000n, requiredConfirmations: 10, queryEngine, virtualDaaScore: 999_999n });
        expect(res.confirmations).toBe(12);
        expect(res.confirmationSource).toBe("provider");
        expect(res.depthKnown).toBe(true);
    });

    it("rejects negative or zero expected amounts", async () => {
        const queryEngine = new WalletQuery({ provider: new MockProvider({}) });
        
        await expect(checkPaymentStatus({
            address: "kaspatest:qqabc",
            expectedAmountSompi: 0n,
            requiredConfirmations: 0,
            queryEngine
        })).rejects.toThrow(/PAYMENT_TRACKER_INVALID_AMOUNT/);
    });
});
