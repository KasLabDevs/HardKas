import { JobRunner, JobStoreJson, JobHandler, JobRecord, JobStore } from '@hardkas/jobs';
import { SnapshotParticipant, SnapshotState } from './snapshot/types.js';

export interface JobsToolkitOptions {
    storePath?: string;
    storage?: any; // e.g. SqliteStorage
}

export class JobsToolkit implements SnapshotParticipant {
    private runner: JobRunner;
    private store: JobStore;

    private constructor(options: JobsToolkitOptions) {
        if (options.storage) {
            this.store = options.storage.createJobStore();
        } else {
            this.store = new JobStoreJson({ filePath: options.storePath || '.hardkas-data/jobs.json' });
        }
        this.runner = new JobRunner({ store: this.store });
    }

    public static open(options: JobsToolkitOptions = {}): JobsToolkit {
        return new JobsToolkit(options);
    }

    public registerHandler(type: string, handler: JobHandler): void {
        this.runner.registerHandler(type, handler);
    }

    public async enqueue(type: string, args?: any): Promise<string> {
        return this.runner.enqueue(type, args);
    }

    public async resumePendingJobs(): Promise<void> {
        return this.runner.resumePendingJobs();
    }

    public async getJob(id: string): Promise<JobRecord | undefined> {
        return this.runner.getJob(id);
    }

    public async snapshot(): Promise<SnapshotState> {
        return this.store.getAll();
    }

    public resetAll() {
        // Not all stores support this, but if we really need it, we should add clear() to JobStore.
        // For now, it's a test utility.
        if ('setAll' in this.store) {
            (this.store as any).setAll({});
        }
    }

    public async restore(state: SnapshotState): Promise<void> {
        this.store.setAll(state as Record<string, JobRecord>);
    }

    public async reload(): Promise<void> {
        // Runner reads from store on each operation natively in current design,
        // but if it had internal queues/caches, we'd clear them here.
        // E.g., this.runner.clearCache();
    }
}
