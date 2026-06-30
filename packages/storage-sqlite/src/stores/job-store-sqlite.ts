// no static import
import type { JobStore, JobRecord } from '@hardkas/jobs';

export class JobStoreSqlite implements JobStore {
    constructor(private db: any) {}

    public getAll(): Record<string, JobRecord> {
        const rows = this.db.prepare('SELECT * FROM jobs').all() as any[];
        const result: Record<string, JobRecord> = {};
        for (const row of rows) {
            result[row.id] = this.mapRow(row);
        }
        return result;
    }

    public setAll(data: Record<string, JobRecord>): void {
        this.db.exec('BEGIN TRANSACTION');
        try {
            this.db.prepare('DELETE FROM jobs').run();
            for (const record of Object.values(data)) {
                this.save(record);
            }
            this.db.exec('COMMIT');
        } catch (e) {
            this.db.exec('ROLLBACK');
            throw e;
        }
    }

    public get(id: string): JobRecord | undefined {
        const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as any;
        if (!row) return undefined;
        return this.mapRow(row);
    }

    public save(record: JobRecord): void {
        this.db.prepare(`
            INSERT OR REPLACE INTO jobs 
            (id, type, status, progress, checkpoint, error, attempts, args, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            record.id,
            record.type,
            record.status,
            record.progress ? JSON.stringify(record.progress) : null,
            record.checkpoint ? JSON.stringify(record.checkpoint) : null,
            record.error || null,
            record.attempts,
            record.args ? JSON.stringify(record.args) : null,
            record.createdAt,
            record.updatedAt
        );
    }

    public update(id: string, updater: (record: JobRecord) => JobRecord): void {
        this.db.exec('BEGIN TRANSACTION');
        try {
            const record = this.get(id);
            if (record) {
                const updated = updater(record);
                this.save(updated);
            }
            this.db.exec('COMMIT');
        } catch (e) {
            this.db.exec('ROLLBACK');
            throw e;
        }
    }

    private mapRow(row: any): JobRecord {
        return {
            id: row.id,
            type: row.type,
            status: row.status,
            progress: row.progress ? JSON.parse(row.progress) : undefined,
            checkpoint: row.checkpoint ? JSON.parse(row.checkpoint) : undefined,
            error: row.error,
            attempts: row.attempts,
            args: row.args ? JSON.parse(row.args) : undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}
