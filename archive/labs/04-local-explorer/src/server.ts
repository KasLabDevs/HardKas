import Fastify from 'fastify';
import { IndexerStore } from './domain/IndexerStore.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const fastify = Fastify({ logger: true });
const store = new IndexerStore();

fastify.get('/addresses/:address/balance', async (request, reply) => {
    const { address } = request.params as { address: string };
    const balance = store.getBalance(address);
    return { address, balanceSompi: balance.toString() };
});

fastify.get('/addresses/:address/utxos', async (request, reply) => {
    const { address } = request.params as { address: string };
    const utxos = store.getUtxos(address);
    // Serialize bigints
    return { 
        address, 
        utxos: utxos.map(u => ({ ...u, amountSompi: u.amountSompi.toString() })) 
    };
});

fastify.get('/addresses/:address/history', async (request, reply) => {
    const { address } = request.params as { address: string };
    const history = store.getHistory(address);
    return { 
        address, 
        history: history.map(h => ({ ...h, amountSompi: h.amountSompi.toString() })) 
    };
});

fastify.get('/transactions/:txid', async (request, reply) => {
    const { txid } = request.params as { txid: string };
    const tx = store.transactions.get(txid);
    if (!tx) {
        reply.code(404);
        return { error: 'Transaction not found' };
    }
    return tx;
});

fastify.get('/payments/:invoiceId', async (request, reply) => {
    const { invoiceId } = request.params as { invoiceId: string };
    const receipt = store.paymentReceiptsByInvoice.get(invoiceId);
    if (!receipt) {
        reply.code(404);
        return { error: 'Payment receipt not found' };
    }
    return receipt;
});

fastify.get('/reconciliation/:merchantId', async (request, reply) => {
    const { merchantId } = request.params as { merchantId: string };
    const receipts = store.paymentReceiptsByMerchant.get(merchantId) || [];
    
    let totalPaid = 0n;
    for (const r of receipts) {
        totalPaid += BigInt(r.amountFoundSompi);
    }
    
    return {
        merchantId,
        paymentsCount: receipts.length,
        totalPaidSompi: totalPaid.toString(),
        receipts
    };
});

fastify.get('/artifacts/:hash', async (request, reply) => {
    const { hash } = request.params as { hash: string };
    const artifact = store.artifacts.get(hash);
    if (!artifact) {
        reply.code(404);
        return { error: 'Artifact not found' };
    }
    return artifact;
});

fastify.get('/health', async () => {
    return { status: 'ok', artifactsIndexed: store.artifacts.size };
});

export { fastify, store };

if (import.meta.url === `file://${process.argv[1]}`) {
    // Optionally ingest some fixtures from the local hardkas dir here
    fastify.listen({ port: 3001 }, (err, address) => {
        if (err) {
            fastify.log.error(err);
            process.exit(1);
        }
        console.log(`Local Explorer listening at ${address}`);
    });
}
