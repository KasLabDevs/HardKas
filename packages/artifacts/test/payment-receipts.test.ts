import { describe, it, expect } from "vitest";
import { createPaymentReceipt } from "../src/payment-receipts.js";

describe("PaymentReceipt Artifact", () => {
    const validInvoice = {
        id: "inv_123",
        merchantId: "merch_456",
        paymentAddress: "kaspatest:qq123",
        amountSompi: 50000n
    };

    const validPolicy = {
        requiredConfirmations: 2,
        riskProfile: "standard"
    };

    it("receipt contains invoiceId/txId/amount/confirmations", () => {
        const receipt = createPaymentReceipt({
            invoice: validInvoice,
            paymentCheckResult: {
                status: "confirmed",
                amountFoundSompi: 50000n,
                txId: "tx_abc123",
                confirmations: 5
            },
            policyResult: validPolicy
        });

        expect(receipt.invoiceId).toBe("inv_123");
        expect(receipt.txId).toBe("tx_abc123");
        expect(receipt.expectedAmountSompi).toBe("50000");
        expect(receipt.confirmations).toBe(5);
        expect(receipt.schema).toBe("hardkas.paymentReceipt.v1");
        expect(receipt.status).toBe("paid");
    });

    it("receipt rejects unpaid status", () => {
        expect(() => createPaymentReceipt({
            invoice: validInvoice,
            paymentCheckResult: {
                status: "mempool",
                amountFoundSompi: 50000n,
                txId: "tx_abc123",
                confirmations: 0
            },
            policyResult: validPolicy
        })).toThrowError(/Status must be 'confirmed'/);
    });

    it("receipt rejects amountFound < expected", () => {
        expect(() => createPaymentReceipt({
            invoice: validInvoice,
            paymentCheckResult: {
                status: "confirmed",
                amountFoundSompi: 40000n, // less than 50000
                txId: "tx_abc123",
                confirmations: 5
            },
            policyResult: validPolicy
        })).toThrowError(/Amount found .* is less than expected/);
    });

    it("receipt rejects confirmations < required", () => {
        expect(() => createPaymentReceipt({
            invoice: validInvoice,
            paymentCheckResult: {
                status: "confirmed",
                amountFoundSompi: 50000n,
                txId: "tx_abc123",
                confirmations: 1 // less than 2
            },
            policyResult: validPolicy
        })).toThrowError(/Confirmations .* is less than required/);
    });

    it("receipt contains no secrets", () => {
        const receipt = createPaymentReceipt({
            invoice: validInvoice,
            paymentCheckResult: {
                status: "confirmed",
                amountFoundSompi: 50000n,
                txId: "tx_abc123",
                confirmations: 5
            },
            policyResult: validPolicy
        });

        const json = JSON.stringify(receipt);
        expect(json).not.toContain("mnemonic");
        expect(json).not.toContain("privateKey");
        expect(json).not.toContain("seed");
    });

    it("receipt claims are explicit false", () => {
        const receipt = createPaymentReceipt({
            invoice: validInvoice,
            paymentCheckResult: {
                status: "confirmed",
                amountFoundSompi: 50000n,
                txId: "tx_abc123",
                confirmations: 5
            },
            policyResult: validPolicy
        });

        expect(receipt.claims.mainnet).toBe(false);
        expect(receipt.claims.productionSettlement).toBe(false);
        expect(receipt.claims.absoluteFinality).toBe(false);
        expect(receipt.claims.economicSafetyGuarantee).toBe(false);
    });
});
