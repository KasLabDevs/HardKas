import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/api/server.js';
import * as fs from 'node:fs/promises';

describe('Batch Engine E2E', () => {
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

    it('should start a reconcile job and complete it', async () => {
        const res = await server.inject({
            method: 'POST',
            url: '/jobs/reconcile'
        });
        
        expect(res.statusCode).toBe(200);
        const { id } = JSON.parse(res.payload);
        expect(id).toBeDefined();

        // Wait for job to complete (mock job takes ~1.5s total)
        await new Promise(r => setTimeout(r, 2000));

        const getRes = await server.inject({
            method: 'GET',
            url: `/jobs/${id}`
        });

        expect(getRes.statusCode).toBe(200);
        const job = JSON.parse(getRes.payload);
        expect(job.status).toBe('completed');
        expect(job.progress.total).toBeGreaterThan(0);
        expect(job.progress.processed).toBe(job.progress.total);
    });

    it('should start an export evidence job and complete it', async () => {
        const res = await server.inject({
            method: 'POST',
            url: '/jobs/export-evidence'
        });
        
        expect(res.statusCode).toBe(200);
        const { id } = JSON.parse(res.payload);

        await new Promise(r => setTimeout(r, 1000));

        const getRes = await server.inject({
            method: 'GET',
            url: `/jobs/${id}`
        });

        expect(getRes.statusCode).toBe(200);
        const job = JSON.parse(getRes.payload);
        expect(job.status).toBe('completed');
    });

    it('should fail gracefully if retrying a non-existent job', async () => {
        const res = await server.inject({
            method: 'POST',
            url: '/jobs/invalid-id/retry'
        });
        expect(res.statusCode).toBe(404);
    });
});
