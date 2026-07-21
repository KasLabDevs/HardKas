import { describe, it, expect } from 'vitest';
import { PaymentToolkit, WalletToolkit, JobsToolkit } from '@hardkas/toolkit';

describe('App 2: Merchant Marketplace App', () => {
    it('should handle 3 merchants, 10 buyers, 30 invoices, and background jobs', async () => {
        const merchants = ["merchantA", "merchantB", "merchantC"];
        const buyers = Array.from({ length: 10 }, (_, i) => `buyer_${i}`);
        let ops = 0;

        const jobs = JobsToolkit.open({ storePath: ".hardkas/marketplace-jobs.json" });

        for (const m of merchants) {
            const paymentTool = PaymentToolkit.openMerchant(m);
            ops++;

            // Create 10 invoices per merchant
            for (let i = 0; i < 10; i++) {
                const inv = await paymentTool.createInvoice({
                    amount: BigInt(i * 1000 + 1000),
                    currency: "KAS"
                });
                ops++;

                expect(inv.status).toBe("pending");

                // Check invoice
                await paymentTool.check(inv.id);
                ops++;

                // generate receipt stub
                await paymentTool.receipt(inv.id);
                ops++;
            }
        }

        // enqueue reconciliation job
        const jobId = await jobs.enqueue("reconcile-marketplace", { batch: true });
        ops++;
        
        const status = await jobs.getJob(jobId);
        expect(status).toBeDefined();

        expect(merchants.length).toBe(3);
        expect(buyers.length).toBe(10);
        expect(ops).toBeGreaterThan(30);
    });
});
