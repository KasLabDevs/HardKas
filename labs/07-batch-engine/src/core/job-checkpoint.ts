import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface CheckpointData {
    jobId: string;
    state: string;
    progress: any;
    cursor?: any;
    updatedAt: string;
}

export class JobCheckpoint {
    private readonly checkpointDir = path.join(process.cwd(), '.checkpoints');

    constructor() {}

    async init() {
        await fs.mkdir(this.checkpointDir, { recursive: true });
    }

    private getCheckpointPath(jobId: string) {
        return path.join(this.checkpointDir, `${jobId}.json`);
    }

    async save(data: CheckpointData): Promise<void> {
        const file = this.getCheckpointPath(data.jobId);
        await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
    }

    async load(jobId: string): Promise<CheckpointData | null> {
        const file = this.getCheckpointPath(jobId);
        try {
            const content = await fs.readFile(file, 'utf-8');
            return JSON.parse(content) as CheckpointData;
        } catch (err: any) {
            if (err.code === 'ENOENT') return null;
            throw err;
        }
    }
}
