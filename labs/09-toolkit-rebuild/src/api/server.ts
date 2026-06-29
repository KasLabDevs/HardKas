import Fastify from 'fastify';
import { WalletToolkit, PaymentToolkit, IndexerToolkit, JobsToolkit } from '@hardkas/toolkit';
import { randomUUID } from 'node:crypto';

export async function buildServer() {
    const fastify = Fastify({ logger: true });

    // --- INFRASTRUCTURE via TOOLKITS ---
    const wallet = WalletToolkit.open('alice', { storePath: '.hardkas-data/wallets.json' });
    const payment = PaymentToolkit.openMerchant('store', { storePath: '.hardkas-data/invoices.json' });
    const indexer = IndexerToolkit.open({ dataDir: '.hardkas-data' });
    const jobs = JobsToolkit.open({ storePath: '.hardkas-data/jobs.json' });

    await wallet.create(); // ensure exists
    await indexer.watch('kaspa:store');

    // Register job natively without exposing ProjectionStore
    jobs.registerHandler('reconcile', async (ctx) => {
        ctx.progress.update({ total: 100, processed: 0 });
        // Simulating work
        for (let i = 1; i <= 10; i++) {
            await new Promise(r => setTimeout(r, 10));
            ctx.progress.update({ total: 100, processed: i * 10 });
            ctx.checkpoint.save({ step: i });
        }
    });

    // --- PAYMENT API ---
    fastify.post('/api/payments/invoice', async (request, reply) => {
        const { amount } = request.body as any;
        
        // Toolkit orchestrates the URI, metadata, and persistence seamlessly
        const inv = await payment.createInvoice({ amount, currency: 'KAS' });

        return { invoiceId: inv.id, uri: inv.uri, amount, status: inv.status };
    });

    fastify.post('/api/payments/simulate', async (request, reply) => {
        const { invoiceId } = request.body as any;
        const inv = await payment.getInvoice(invoiceId);
        
        if (!inv) return reply.status(404).send({ error: 'Invoice not found' });
        
        // Simulate wallet sending funds
        await wallet.sendSimulated({ to: 'kaspa:store', amount: inv.amount });
        
        // Toolkit handles state update
        await payment.simulatePay(invoiceId);

        // Generate receipt using toolkit
        const receipt = await payment.receipt(invoiceId);
        
        // Ingest artifact using indexer toolkit
        await indexer.ingestArtifact({
            id: randomUUID(),
            schema: receipt.schema,
            tags: [`merchant:${receipt.merchantId}`, `invoice:${invoiceId}`]
        });

        return { success: true, invoiceId };
    });

    // --- EXPLORER API ---
    fastify.get('/api/explorer/balance', async (request, reply) => {
        // High level read
        const balance = await indexer.balance('kaspa:store');
        return { address: 'kaspa:store', balance };
    });

    // --- ORACLE API ---
    fastify.get('/api/oracle/metrics', async (request, reply) => {
        // Toolkit directly exposes aggregate stats, no manual iteration or mapping required
        const stats = await payment.stats();
        return stats;
    });

    // --- BATCH API ---
    fastify.post('/api/jobs/reconcile', async (request, reply) => {
        // High level job submission
        const id = await jobs.enqueue('reconcile', {});
        return { id, message: 'Reconcile job started' };
    });

    fastify.get('/api/jobs/:id', async (request: any, reply) => {
        const { id } = request.params;
        const job = await jobs.getJob(id);
        if (!job) return reply.status(404).send({ error: 'Job not found' });
        return job;
    });

    return fastify;
}
