import { JobCheckpoint, CheckpointData } from './job-checkpoint.js';
import { ProgressReporter } from './progress-reporter.js';
import { randomUUID } from 'node:crypto';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface JobState {
    id: string;
    type: string;
    status: JobStatus;
    progress: any;
    error?: string;
}

export type JobFunction = (jobId: string, reporter: ProgressReporter, checkpoint: JobCheckpoint, startCursor?: any) => Promise<void>;

export class JobRunner {
    private jobs: Map<string, JobState> = new Map();
    private checkpoint = new JobCheckpoint();

    constructor() {}

    async init() {
        await this.checkpoint.init();
    }

    async submit(type: string, fn: JobFunction): Promise<string> {
        const id = randomUUID();
        this.jobs.set(id, {
            id,
            type,
            status: 'pending',
            progress: new ProgressReporter().toJSON()
        });

        // Background execution
        this.runJob(id, fn).catch(console.error);
        return id;
    }

    private async runJob(id: string, fn: JobFunction, isRetry: boolean = false) {
        const job = this.jobs.get(id);
        if (!job) return;

        job.status = 'running';
        const reporter = new ProgressReporter();
        
        let startCursor: any;

        if (isRetry) {
            const cp = await this.checkpoint.load(id);
            if (cp) {
                startCursor = cp.cursor;
                reporter.total = cp.progress.total;
                reporter.processed = cp.progress.processed;
                reporter.failed = cp.progress.failed;
            }
        }

        const interval = setInterval(async () => {
            job.progress = reporter.toJSON();
            await this.checkpoint.save({
                jobId: id,
                state: job.status,
                progress: job.progress,
                updatedAt: new Date().toISOString()
            });
        }, 1000);

        try {
            await fn(id, reporter, this.checkpoint, startCursor);
            job.status = 'completed';
            job.progress = reporter.toJSON();
            job.progress.status = 'completed';
        } catch (err: any) {
            job.status = 'failed';
            job.error = err.message;
            job.progress = reporter.toJSON();
            job.progress.status = 'failed';
        } finally {
            clearInterval(interval);
            await this.checkpoint.save({
                jobId: id,
                state: job.status,
                progress: job.progress,
                updatedAt: new Date().toISOString()
            });
        }
    }

    getJob(id: string): JobState | undefined {
        return this.jobs.get(id);
    }

    async retry(id: string, fn: JobFunction): Promise<void> {
        const job = this.jobs.get(id);
        if (!job) throw new Error("Job not found");
        if (job.status !== 'failed') throw new Error("Only failed jobs can be retried");

        job.status = 'pending';
        job.error = undefined;
        this.runJob(id, fn, true).catch(console.error);
    }
}
