import { randomUUID } from 'node:crypto';
import { JobStore, JobRecord } from './job-store.js';
import { ProgressReporter } from './progress-reporter.js';
import { JobCheckpoint } from './job-checkpoint.js';
import { RetryPolicy } from './retry-policy.js';

export interface JobContext {
    progress: ProgressReporter;
    checkpoint: JobCheckpoint;
    retry: RetryPolicy;
}

export type JobHandler = (ctx: JobContext, args?: any) => Promise<void>;

export interface JobRunnerOptions {
    store: JobStore;
}

export class JobRunner {
    private handlers = new Map<string, JobHandler>();
    private store: JobStore;

    constructor(options: JobRunnerOptions) {
        this.store = options.store;
    }

    public registerHandler(type: string, handler: JobHandler) {
        this.handlers.set(type, handler);
    }

    public async resumePendingJobs(): Promise<void> {
        const all = await this.store.getAll();
        for (const [id, record] of Object.entries(all)) {
            if (record.status === 'running' || record.status === 'pending' || record.status === 'retrying') {
                this.runJob(id, record.args).catch(console.error);
            }
        }
    }

    public async enqueue(type: string, args?: any): Promise<string> {
        const id = randomUUID();
        const record: JobRecord & { args?: any } = {
            id,
            type,
            status: 'pending',
            progress: new ProgressReporter().toJSON(),
            attempts: 0,
            args, // Store args for recovery
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        await this.store.save(record);

        // Async execution starts
        this.runJob(id, args).catch(console.error);
        return id;
    }

    private async runJob(id: string, args?: any) {
        const record = await this.store.get(id);
        if (!record) return;

        const handler = this.handlers.get(record.type);
        if (!handler) {
            record.status = 'failed';
            record.error = `No handler registered for job type: ${record.type}`;
            record.updatedAt = new Date().toISOString();
            await this.store.save(record);
            return;
        }

        record.status = record.attempts > 0 ? 'retrying' : 'running';
        record.attempts += 1;
        record.updatedAt = new Date().toISOString();
        await this.store.save(record);

        const reporter = new ProgressReporter();
        if (record.progress) {
            reporter.update(record.progress);
        }

        const checkpoint = new JobCheckpoint(record.checkpoint);
        checkpoint.commit = async () => {
            await this.store.update(id, (rec) => {
                rec.checkpoint = checkpoint.load();
                rec.updatedAt = new Date().toISOString();
                return rec;
            });
        };
        
        // Let's use a default internal retry policy if the user wants to wrap small chunks.
        // It's exposed on context so the handler can use it.
        const retry = new RetryPolicy({ maxRetries: 3, baseDelayMs: 100 });
        
        const ctx: JobContext = {
            progress: reporter,
            checkpoint,
            retry
        };

        const interval = setInterval(() => {
            Promise.resolve(this.store.update(id, (rec) => {
                rec.progress = reporter.toJSON();
                rec.checkpoint = checkpoint.load();
                rec.updatedAt = new Date().toISOString();
                return rec;
            })).catch(console.error);
        }, 1000);

        try {
            await handler(ctx, args);
            
            clearInterval(interval);
            
            await this.store.update(id, (rec) => {
                rec.status = 'completed';
                rec.progress = reporter.toJSON();
                rec.checkpoint = checkpoint.load();
                rec.updatedAt = new Date().toISOString();
                return rec;
            });
        } catch (err: any) {
            clearInterval(interval);
            
            await this.store.update(id, (rec) => {
                rec.status = 'failed';
                rec.error = err.message;
                rec.progress = reporter.toJSON();
                rec.checkpoint = checkpoint.load();
                rec.updatedAt = new Date().toISOString();
                return rec;
            });
        }
    }

    public async getJob(id: string): Promise<JobRecord | undefined> {
        return this.store.get(id);
    }
}
