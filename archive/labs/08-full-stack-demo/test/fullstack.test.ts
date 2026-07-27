import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/api/server.js';
import * as fs from 'node:fs/promises';

describe('Full Stack Demo API', () => {
    let server: any;

    beforeAll(async () => {
        server = await buildServer();
    });

    afterAll(async () => {
        await server.close();
        try {
            await fs.rm('.checkpoints', { recursive: true, force: true });
            await fs.rm('.hardkas-data', { recursive: true, force: true });
        } catch (e) {}
    });

    it('should serve index.html', async () => {
        const res = await server.inject({
            method: 'GET',
            url: '/'
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/html');
    });

    it('should create invoice and simulate payment', async () => {
        // Create
        const createRes = await server.inject({
            method: 'POST',
            url: '/api/payments/invoice',
            payload: { amount: 100 }
        });
        expect(createRes.statusCode).toBe(200);
        const inv = JSON.parse(createRes.payload);
        expect(inv.status).toBe('pending');

        // Simulate
        const simRes = await server.inject({
            method: 'POST',
            url: '/api/payments/simulate',
            payload: { invoiceId: inv.invoiceId }
        });
        expect(simRes.statusCode).toBe(200);

        // Check oracle
        const oracleRes = await server.inject({
            method: 'GET',
            url: '/api/oracle/metrics'
        });
        const metrics = JSON.parse(oracleRes.payload);
        expect(metrics.paidInvoices).toBeGreaterThan(0);
    });

    it('should start reconcile job successfully', async () => {
        const res = await server.inject({
            method: 'POST',
            url: '/api/jobs/reconcile'
        });
        expect(res.statusCode).toBe(200);
        const { id } = JSON.parse(res.payload);
        
        const jobRes = await server.inject({
            method: 'GET',
            url: `/api/jobs/${id}`
        });
        expect(jobRes.statusCode).toBe(200);
        const job = JSON.parse(jobRes.payload);
        expect(job.status).toBeDefined();
    });
});
