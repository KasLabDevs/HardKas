import { bench, describe, beforeAll } from 'vitest';
import { JobsToolkit } from '@hardkas/toolkit';

describe('JobsToolkit Benchmarks (100 jobs)', () => {
    let jobs: JobsToolkit;
    let jobIds: string[] = [];

    beforeAll(async () => {
        jobs = await JobsToolkit.open({ storePath: ':memory:' });
        jobs.registerHandler('bench-job', async () => {});
        for (let i = 0; i < 100; i++) {
            const id = await jobs.enqueue('bench-job', { idx: i });
            jobIds.push(id);
        }
    });

    bench('enqueue 100 jobs fresh', async () => {
        const temp = await JobsToolkit.open({ storePath: ':memory:' });
        temp.registerHandler('bench-job', async () => {});
        for (let i = 0; i < 100; i++) {
            await temp.enqueue('bench-job', { idx: i });
        }
    });

    bench('progress', async () => {
        if (jobIds.length > 0) {
            await jobs.updateProgress(jobIds[0], { total: 100, processed: 50 });
        }
    });

    bench('retry', async () => {
        if (jobIds.length > 0) {
            await jobs.retry(jobIds[0]);
        }
    });

    bench('checkpoint', async () => {
        if (jobIds.length > 0) {
            // Mock a checkpoint 
            const job = await jobs.getJob(jobIds[0]);
            if (job) {
                job.status = 'completed';
                await (jobs as any).store.save(job.id, job);
            }
        }
    });
});

describe('JobsToolkit Benchmarks (1k jobs)', () => {
    bench('enqueue 1k jobs fresh', async () => {
        const temp = await JobsToolkit.open({ storePath: ':memory:' });
        temp.registerHandler('bench-job', async () => {});
        for (let i = 0; i < 1000; i++) {
            await temp.enqueue('bench-job', { idx: i });
        }
    });
});

describe('JobsToolkit Benchmarks (10k jobs)', () => {
    bench('enqueue 10k jobs fresh', async () => {
        const temp = await JobsToolkit.open({ storePath: ':memory:' });
        temp.registerHandler('bench-job', async () => {});
        for (let i = 0; i < 10000; i++) {
            await temp.enqueue('bench-job', { idx: i });
        }
    });
});
