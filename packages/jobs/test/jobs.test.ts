import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { JobRunner, JobStoreJson } from '../src/index.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

describe('@hardkas/jobs V1', () => {
    const storePath = path.join(process.cwd(), '.test-data', 'jobs.json');
    let runner: JobRunner;

    beforeAll(async () => {
        try { await fs.mkdir('.test-data', { recursive: true }); } catch (e) {}
        runner = new JobRunner({
            store: new JobStoreJson({ filePath: storePath })
        });
    });

    afterAll(async () => {
        try { await fs.rm('.test-data', { recursive: true, force: true }); } catch (e) {}
    });

    it('should complete a job and save progress', async () => {
        runner.registerHandler('test-job', async (ctx) => {
            ctx.progress.update({ total: 10, processed: 0 });
            for (let i = 0; i < 10; i++) {
                ctx.progress.incSuccess();
                ctx.checkpoint.save({ index: i });
            }
        });

        const jobId = await runner.enqueue('test-job');
        
        let job = await runner.getJob(jobId);
        expect(job).toBeDefined();
        expect(['pending', 'running', 'completed']).toContain(job!.status);

        // wait for completion
        await new Promise(r => setTimeout(r, 100));

        job = await runner.getJob(jobId);
        expect(job!.status).toBe('completed');
        expect(job!.progress.total).toBe(10);
        expect(job!.progress.processed).toBe(10);
        expect(job!.checkpoint).toEqual({ index: 9 });
    });

    it('should fail a job if it throws', async () => {
        runner.registerHandler('fail-job', async (ctx) => {
            throw new Error('Simulation failure');
        });

        const jobId = await runner.enqueue('fail-job');
        await new Promise(r => setTimeout(r, 100));

        const job = await runner.getJob(jobId);
        expect(job!.status).toBe('failed');
        expect(job!.error).toBe('Simulation failure');
    });

    it('should allow retrying within the handler using context', async () => {
        runner.registerHandler('retry-job', async (ctx) => {
            let calls = 0;
            await ctx.retry.execute(async () => {
                calls++;
                if (calls < 2) throw new Error('Fail first');
                return true;
            });
            ctx.checkpoint.save({ calls });
        });

        const jobId = await runner.enqueue('retry-job');
        await new Promise(r => setTimeout(r, 300));

        const job = await runner.getJob(jobId);
        expect(job!.status).toBe('completed');
        expect(job!.checkpoint.calls).toBe(2);
    });
});
