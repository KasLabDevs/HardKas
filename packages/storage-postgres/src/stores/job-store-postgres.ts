import type { JobStore, JobRecord } from '@hardkas/jobs';
import postgres from 'postgres';

export class JobStorePostgres implements JobStore {
    constructor(private sql: postgres.Sql) {}

    public async getAll(): Promise<Record<string, JobRecord>> {
        const rows = await this.sql`SELECT * FROM jobs`;
        const result: Record<string, JobRecord> = {};
        for (const row of rows) {
            result[row.id] = this.mapRow(row);
        }
        return result;
    }

    public async setAll(data: Record<string, JobRecord>): Promise<void> {
        await this.sql.begin(async sql => {
            await sql`DELETE FROM jobs`;
            for (const record of Object.values(data)) {
                await this.saveWithSql(sql, record);
            }
        });
    }

    public async get(id: string): Promise<JobRecord | undefined> {
        const rows = await this.sql`SELECT * FROM jobs WHERE id = ${id}`;
        if (rows.length === 0) return undefined;
        return this.mapRow(rows[0]);
    }

    public async save(record: JobRecord): Promise<void> {
        await this.saveWithSql(this.sql, record);
    }

    private async saveWithSql(sql: any, record: JobRecord): Promise<void> {
        await sql`
            INSERT INTO jobs (
                id, type, status, progress, checkpoint, error, attempts, args, created_at, updated_at
            ) VALUES (
                ${record.id},
                ${record.type},
                ${record.status},
                ${record.progress ? sql.json(record.progress) : null},
                ${record.checkpoint ? sql.json(record.checkpoint) : null},
                ${record.error || null},
                ${record.attempts},
                ${record.args ? sql.json(record.args) : null},
                ${record.createdAt},
                ${record.updatedAt}
            )
            ON CONFLICT (id) DO UPDATE SET
                type = EXCLUDED.type,
                status = EXCLUDED.status,
                progress = EXCLUDED.progress,
                checkpoint = EXCLUDED.checkpoint,
                error = EXCLUDED.error,
                attempts = EXCLUDED.attempts,
                args = EXCLUDED.args,
                updated_at = EXCLUDED.updated_at
        `;
    }

    public async update(id: string, updater: (record: JobRecord) => JobRecord | Promise<JobRecord>): Promise<void> {
        await this.sql.begin(async sql => {
            // For a lock: SELECT ... FOR UPDATE
            const rows = await sql`SELECT * FROM jobs WHERE id = ${id} FOR UPDATE`;
            if (rows.length > 0) {
                const record = this.mapRow(rows[0]);
                const updated = await updater(record);
                await this.saveWithSql(sql, updated);
            }
        });
    }

    private mapRow(row: any): JobRecord {
        return {
            id: row.id,
            type: row.type,
            status: row.status,
            progress: row.progress || undefined,
            checkpoint: row.checkpoint || undefined,
            error: row.error || undefined,
            attempts: row.attempts,
            args: row.args || undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}
