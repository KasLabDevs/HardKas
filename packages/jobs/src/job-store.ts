export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retrying';

export interface JobRecord {
    id: string;
    type: string;
    status: JobStatus;
    progress?: any;
    checkpoint?: any;
    error?: string;
    attempts: number;
    args?: any;
    createdAt: string;
    updatedAt: string;
}

export interface JobStore {
    getAll(): Promise<Record<string, JobRecord>> | Record<string, JobRecord>;
    setAll(data: Record<string, JobRecord>): Promise<void> | void;
    get(id: string): Promise<JobRecord | undefined> | JobRecord | undefined;
    save(record: JobRecord): Promise<void> | void;
    update(id: string, updater: (record: JobRecord) => JobRecord | Promise<JobRecord>): Promise<void> | void;
}
