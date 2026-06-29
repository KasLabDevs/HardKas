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
