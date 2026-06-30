// No static import for node:sqlite
import { JobStoreSqlite } from './stores/job-store-sqlite.js';
import { InvoiceStoreSqlite } from './stores/invoice-store-sqlite.js';

export interface SqliteStorageOptions {
    path: string;
}

export class SqliteStorage {
    public db: any; // DatabaseSync

    constructor(private options: SqliteStorageOptions) {
        // Bypass bundler static analysis
        const mod = 'node:sqlite';
        const { DatabaseSync } = require(mod);
        this.db = new DatabaseSync(options.path);
        // Enable WAL mode for concurrency and performance
        this.db.exec('PRAGMA journal_mode = WAL');
        this.db.exec('PRAGMA synchronous = NORMAL');
    }

    public async migrate() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check if 001 is applied
        const row = this.db.prepare(`SELECT version FROM schema_migrations WHERE version = 1`).get();
        if (!row) {
            this.transaction(() => {
                this.db.exec(`
                    CREATE TABLE jobs (
                        id TEXT PRIMARY KEY,
                        type TEXT NOT NULL,
                        status TEXT NOT NULL,
                        progress TEXT,
                        checkpoint TEXT,
                        error TEXT,
                        attempts INTEGER NOT NULL,
                        args TEXT,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL
                    )
                `);
                this.db.prepare(`INSERT INTO schema_migrations (version, name) VALUES (?, ?)`).run(1, '001_initial_jobs');
            });
        }
        
        // Next migrations would be checked similarly here
        const row2 = this.db.prepare(`SELECT version FROM schema_migrations WHERE version = 2`).get();
        if (!row2) {
            this.transaction(() => {
                this.db.exec(`
                    CREATE TABLE invoices (
                        id TEXT PRIMARY KEY,
                        merchant_id TEXT NOT NULL,
                        amount TEXT NOT NULL,
                        currency TEXT NOT NULL,
                        status TEXT NOT NULL,
                        uri TEXT NOT NULL,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL
                    )
                `);
                this.db.prepare(`INSERT INTO schema_migrations (version, name) VALUES (?, ?)`).run(2, '002_initial_invoices');
            });
        }
    }

    public transaction<T>(fn: () => T): T {
        this.db.exec('BEGIN TRANSACTION');
        try {
            const result = fn();
            this.db.exec('COMMIT');
            return result;
        } catch (err) {
            this.db.exec('ROLLBACK');
            throw err;
        }
    }

    // Factory methods
    public createJobStore() {
        return new JobStoreSqlite(this.db);
    }

    public createInvoiceStore() {
        return new InvoiceStoreSqlite(this.db);
    }
}

export function sqliteStorage(options: SqliteStorageOptions) {
    return new SqliteStorage(options);
}
