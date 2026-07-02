import postgres from 'postgres';
import { JobStorePostgres } from './stores/job-store-postgres.js';
import { InvoiceStorePostgres } from './stores/invoice-store-postgres.js';

export interface PostgresStorageOptions {
    url: string;
}

export class PostgresStorage {
    public sql: postgres.Sql;
    
    constructor(options: PostgresStorageOptions) {
        this.sql = postgres(options.url);
    }

    public async migrate(): Promise<void> {
        await this.sql`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        const applied = await this.sql`SELECT version FROM schema_migrations`;
        const appliedSet = new Set(applied.map((r: any) => r.version));

        if (!appliedSet.has('001_initial_jobs')) {
            await this.sql.begin(async (sql: postgres.TransactionSql<any>) => {
                await sql`
                    CREATE TABLE jobs (
                        id TEXT PRIMARY KEY,
                        type TEXT NOT NULL,
                        status TEXT NOT NULL,
                        progress JSONB,
                        checkpoint JSONB,
                        error TEXT,
                        attempts INTEGER NOT NULL DEFAULT 0,
                        args JSONB,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                `;
                await sql`INSERT INTO schema_migrations (version) VALUES ('001_initial_jobs')`;
            });
        }

        if (!appliedSet.has('002_initial_invoices')) {
            await this.sql.begin(async (sql: postgres.TransactionSql<any>) => {
                await sql`
                    CREATE TABLE invoices (
                        id TEXT PRIMARY KEY,
                        reference_id TEXT NOT NULL,
                        merchant_id TEXT NOT NULL,
                        amount_sompi TEXT NOT NULL,
                        currency TEXT NOT NULL,
                        status TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        expires_at TEXT NOT NULL,
                        completed_at TEXT,
                        payment_address TEXT NOT NULL,
                        metadata JSONB,
                        events JSONB
                    )
                `;
                await sql`INSERT INTO schema_migrations (version) VALUES ('002_initial_invoices')`;
            });
        }
    }

    public async close(): Promise<void> {
        await this.sql.end();
    }

    public createJobStore(): JobStorePostgres {
        return new JobStorePostgres(this.sql);
    }

    public createInvoiceStore(): InvoiceStorePostgres {
        return new InvoiceStorePostgres(this.sql);
    }
}

export function postgresStorage(options: PostgresStorageOptions): PostgresStorage {
    return new PostgresStorage(options);
}
