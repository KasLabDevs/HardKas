import { JobsToolkit } from '@hardkas/toolkit';

async function run() {
    // 1. Initialize JobsToolkit (orchestrates JobRunner + JobStoreJson)
    const jobs = JobsToolkit.open({ 
        storePath: '.hardkas-data/jobs.json' 
    });

    // 2. Register a handler for a job type
    jobs.registerHandler('export-evidence', async (ctx) => {
        // Initialize progress
        ctx.progress.update({ total: 100, processed: 0 });

        // Simulate work
        for(let i = 1; i <= 10; i++) {
            await new Promise(r => setTimeout(r, 100));
            ctx.progress.update({ total: 100, processed: i * 10 });
            ctx.checkpoint.save({ step: i });
        }
    });

    // 3. Enqueue a new job
    const jobId = await jobs.enqueue('export-evidence', { batchId: 'b_123' });
    console.log(`Enqueued job: ${jobId}`);

    // 4. Retrieve job status
    const job = await jobs.getJob(jobId);
    console.log(`Job state: ${job?.state}, Progress: ${job?.progress?.processed}/${job?.progress?.total}`);
}

run().catch(console.error);
