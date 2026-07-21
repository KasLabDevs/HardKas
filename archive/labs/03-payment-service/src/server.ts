import Fastify from 'fastify';
import { PaymentService } from './domain/PaymentService.js';
import { FetchWebhookTransport } from './domain/WebhookTransport.js';
import { WalletQuery } from '@hardkas/query';

const fastify = Fastify({ logger: true });

// For a real app, this provider would connect to a DB/RPC.
const mockQueryProvider = {
    source: "mock" as const,
    getBalances: async (addresses: string[]) => {
        const res: Record<string, bigint> = {};
        for (const a of addresses) res[a] = 0n; // Default 0
        return res;
    },
    getUtxos: async (addresses: string[]) => {
        const res: Record<string, any[]> = {};
        for (const a of addresses) res[a] = [];
        return res;
    },
    getHistory: async () => ({ items: [] })
};

const queryEngine = new WalletQuery({ provider: mockQueryProvider });
const webhookTransport = new FetchWebhookTransport();
const paymentService = new PaymentService(queryEngine, webhookTransport);

fastify.post('/merchants', async (request, reply) => {
    const { merchantId, webhookUrl } = request.body as any;
    paymentService.registerMerchant(merchantId, webhookUrl);
    return { success: true, merchantId };
});

fastify.post('/invoices', async (request, reply) => {
    const { merchantId, amountSompi, memo } = request.body as any;
    const invoice = await paymentService.createInvoice({
        merchantId,
        amountSompi: BigInt(amountSompi),
        memo
    });
    // Serialize bigint
    return { ...invoice, amountSompi: invoice.amountSompi.toString() };
});

fastify.get('/invoices/:id', async (request, reply) => {
    const { id } = request.params as any;
    const invoice = await paymentService.getInvoice(id);
    const uri = await paymentService.getPaymentUri(id);
    return { ...invoice, amountSompi: invoice.amountSompi.toString(), uri };
});

fastify.post('/invoices/:id/check', async (request, reply) => {
    const { id } = request.params as any;
    const invoice = await paymentService.checkPayment(id);
    return { ...invoice, amountSompi: invoice.amountSompi.toString() };
});

fastify.post('/webhooks/test', async (request, reply) => {
    // A mock webhook receiver for our own testing
    fastify.log.info({ body: request.body }, "Webhook received");
    return { received: true };
});

fastify.get('/payments/:id', async (request, reply) => {
    // A mock route. In the future this would retrieve the specific payment receipt artifact directly.
    return { message: "Use /evidence/export for now" };
});

fastify.get('/reconciliation', async (request, reply) => {
    const { merchantId } = request.query as any;
    const report = await paymentService.reconciliation(merchantId);
    return {
        totalPaidSompi: report.totalPaidSompi.toString(),
        onchainBalanceSompi: report.onchainBalanceSompi.toString(),
        match: report.match
    };
});

fastify.post('/evidence/export', async (request, reply) => {
    const { merchantId } = request.body as any;
    const receipts = await paymentService.exportEvidence(merchantId);
    return { receipts };
});

// Export for testing
export { fastify, paymentService, queryEngine, mockQueryProvider };

if (import.meta.url === `file://${process.argv[1]}`) {
    fastify.listen({ port: 3000 }, (err, address) => {
        if (err) {
            fastify.log.error(err);
            process.exit(1);
        }
        console.log(`Server listening at ${address}`);
    });
}
