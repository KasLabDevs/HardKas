import { describe, it, expect, beforeEach } from 'vitest';
import { fastify, store } from '../src/server.js';
import { PaymentReceiptArtifactV1, TxReceiptArtifactV1 } from '@hardkas/artifacts';
import { randomUUID } from 'node:crypto';

describe('Local Explorer API', () => {
    beforeEach(() => {
        store.artifacts.clear();
        store.paymentReceiptsByInvoice.clear();
        store.paymentReceiptsByMerchant.clear();
        store.addressBalances.clear();
        store.addressUtxos.clear();
        store.addressHistory.clear();
        store.transactions.clear();
    });

    it('should ingest and project a PaymentReceipt', async () => {
        const merchantId = randomUUID();
        const invoiceId = randomUUID();
        const paymentAddress = `kaspatest:qq${randomUUID().slice(0, 8)}`;
        const txId = randomUUID();

        const receipt: PaymentReceiptArtifactV1 = {
            schema: "hardkas.paymentReceipt.v1",
            hardkasVersion: "0.11.0-alpha",
            version: "1.0.0",
            networkId: "simnet",
            mode: "linear",
            createdAt: new Date().toISOString(),
            contentHash: "hash-123",
            
            invoiceId,
            merchantId,
            paymentAddress,
            expectedAmountSompi: "1000",
            amountFoundSompi: "1000",
            txId,
            confirmations: 10,
            requiredConfirmations: 10,
            status: "paid",
            paidAt: Date.now(),
            policy: { model: "mock", riskProfile: "standard" },
            tracker: { model: "mock" },
            claims: { mainnet: false, productionSettlement: false, absoluteFinality: false, economicSafetyGuarantee: false }
        };

        store.ingestArtifact(receipt);

        // Test Balance
        let res = await fastify.inject({ method: 'GET', url: `/addresses/${paymentAddress}/balance` });
        expect(res.statusCode).toBe(200);
        let data = JSON.parse(res.payload);
        expect(data.balanceSompi).toBe("1000");

        // Test Utxos
        res = await fastify.inject({ method: 'GET', url: `/addresses/${paymentAddress}/utxos` });
        data = JSON.parse(res.payload);
        expect(data.utxos.length).toBe(1);
        expect(data.utxos[0].transactionId).toBe(txId);

        // Test Payments
        res = await fastify.inject({ method: 'GET', url: `/payments/${invoiceId}` });
        data = JSON.parse(res.payload);
        expect(data.invoiceId).toBe(invoiceId);

        // Test Reconciliation
        res = await fastify.inject({ method: 'GET', url: `/reconciliation/${merchantId}` });
        data = JSON.parse(res.payload);
        expect(data.totalPaidSompi).toBe("1000");
        expect(data.paymentsCount).toBe(1);

        // Test Artifacts
        res = await fastify.inject({ method: 'GET', url: `/artifacts/hash-123` });
        data = JSON.parse(res.payload);
        expect(data.schema).toBe("hardkas.paymentReceipt.v1");
    });

    it('should ingest and project a TxReceipt', async () => {
        const txId = randomUUID();
        const fromAddr = "kaspatest:qqsender";
        const toAddr = "kaspatest:qqreceiver";

        const receipt: TxReceiptArtifactV1 = {
            schema: "hardkas.txReceipt.v1",
            hardkasVersion: "0.11.0-alpha",
            version: "1.0.0",
            networkId: "simnet",
            mode: "linear",
            createdAt: new Date().toISOString(),
            contentHash: "hash-tx",

            txId,
            status: "confirmed",
            from: { address: fromAddr },
            to: { address: toAddr },
            amountSompi: "5000",
            amount: "0.00005",
            feeSompi: "100",
            submittedAt: new Date().toISOString(),
            rpcUrl: "mock"
        };

        store.ingestArtifact(receipt);

        // Check sender balance (should be negative since it started at 0)
        let res = await fastify.inject({ method: 'GET', url: `/addresses/${fromAddr}/balance` });
        let data = JSON.parse(res.payload);
        expect(data.balanceSompi).toBe("-5100"); // -5000 - 100

        // Check receiver balance
        res = await fastify.inject({ method: 'GET', url: `/addresses/${toAddr}/balance` });
        data = JSON.parse(res.payload);
        expect(data.balanceSompi).toBe("5000");

        // Check transaction
        res = await fastify.inject({ method: 'GET', url: `/transactions/${txId}` });
        data = JSON.parse(res.payload);
        expect(data.amountSompi).toBe("5000");
    });
});
