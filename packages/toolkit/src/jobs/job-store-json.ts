import * as fs from 'node:fs';
import * as path from 'node:path';

import { JobRecord, JobStore } from './job-store.js';

export interface JobStoreOptions {
    filePath?: string;
}

export class JobStoreJson implements JobStore {
    private readonly filePath: string;

    constructor(options?: JobStoreOptions) {
        this.filePath = options?.filePath || path.join(process.cwd(), '.hardkas', 'jobs.json');
    }

    private ensureDir() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    public getAll(): Record<string, JobRecord> {
        if (!fs.existsSync(this.filePath)) return {};
        try {
            return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        } catch {
            return {};
        }
    }

    public setAll(data: Record<string, JobRecord>) {
        this.ensureDir();
        fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    }

    public get(id: string): JobRecord | undefined {
        return this.getAll()[id];
    }

    public save(record: JobRecord): void {
        const data = this.getAll();
        data[record.id] = record;
        this.setAll(data);
    }

    public update(id: string, updater: (record: JobRecord) => JobRecord): void {
        const data = this.getAll();
        if (data[id]) {
            data[id] = updater(data[id]);
            this.setAll(data);
        }
    }
}
