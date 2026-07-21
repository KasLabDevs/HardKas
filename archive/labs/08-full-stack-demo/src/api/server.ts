import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import * as path from 'node:path';
import { JobRunner } from '../core/index.js';
import { ProjectionStoreJson } from '@hardkas/query-store';
import { ArtifactIndexStoreJson, EvidenceBatchExporter } from '@hardkas/artifacts';
import { EventSubscriber } from '@hardkas/core';
import { createReconcileJob } from '../jobs/reconcile.js';
import { randomUUID } from 'node:crypto';

export async function buildServer() {
    const fastify = Fastify({ logger: true });

    // Static frontend
    fastify.register(fastifyStatic, {
        root: path.join(process.cwd(), 'public'),
        prefix: '/',
    });

    // Infrastructure stores
    const jobRunner = new JobRunner();
    await jobRunner.init();

    const projectionStore = new ProjectionStoreJson({ namespace: 'full-stack', dirPath: '.hardkas-data/projections' });
    const artifactIndex = new ArtifactIndexStoreJson({ filePath: '.hardkas-data/artifacts-index.json' });
    const evidenceExporter = new EvidenceBatchExporter(artifactIndex);
    const eventSubscriber = new EventSubscriber(); // Mock for Oracle

    // Initialize mock data if empty
    if (!projectionStore.get('balances')) {
        projectionStore.set('balances', { 'kaspa:store': 0 });
    }

    const reconcileJob = createReconcileJob({ projectionStore, artifactIndex, evidenceExporter });

    // --- PAYMENT API ---
    fastify.post('/api/payments/invoice', async (request, reply) => {
        const invoiceId = randomUUID();
        const { amount } = request.body as any;
        
        projectionStore.update('invoices', (prev: any) => {
            const invoices = prev || {};
            invoices[invoiceId] = { amount, status: 'pending', address: 'kaspa:store' };
            return invoices;
        });

        return { invoiceId, address: 'kaspa:store', amount, status: 'pending' };
    });

    fastify.post('/api/payments/simulate', async (request, reply) => {
        const { invoiceId } = request.body as any;
        const invoices = projectionStore.get('invoices') || {};
        const inv = invoices[invoiceId];
        
        if (!inv) return reply.status(404).send({ error: 'Invoice not found' });
        
        inv.status = 'paid';
        projectionStore.set('invoices', invoices);

        // Update balance (Oracle side-effect)
        projectionStore.update('balances', (prev: any) => {
            const b = prev || {};
            b['kaspa:store'] = (b['kaspa:store'] || 0) + Number(inv.amount);
            return b;
        });

        // Add to artifacts
        artifactIndex.index({
            hash: randomUUID(),
            schema: 'payment-receipt.v1',
            timestamp: new Date().toISOString(),
            filePath: `/mock/path/${invoiceId}.json`,
            tags: ['merchant:kaspa:store', `invoice:${invoiceId}`]
        });

        return { success: true, invoiceId };
    });

    // --- EXPLORER API ---
    fastify.get('/api/explorer/balance', async (request, reply) => {
        const balances = projectionStore.get('balances') || {};
        return { address: 'kaspa:store', balance: balances['kaspa:store'] || 0 };
    });

    // --- ORACLE API ---
    fastify.get('/api/oracle/metrics', async (request, reply) => {
        const invoices = projectionStore.get('invoices') || {};
        const count = Object.keys(invoices).length;
        const paid = Object.values(invoices).filter((i: any) => i.status === 'paid').length;
        
        return { totalInvoices: count, paidInvoices: paid };
    });

    // --- BATCH API ---
    fastify.post('/api/jobs/reconcile', async (request, reply) => {
        const id = await jobRunner.submit('reconcile', reconcileJob);
        return { id, message: 'Reconcile job started' };
    });

    fastify.get('/api/jobs/:id', async (request: any, reply) => {
        const { id } = request.params;
        const job = jobRunner.getJob(id);
        if (!job) return reply.status(404).send({ error: 'Job not found' });
        return job;
    });

    return fastify;
}
