import type { InvoiceStore, InvoiceRecord } from '@hardkas/toolkit';
import postgres from 'postgres';

export class InvoiceStorePostgres implements InvoiceStore {
    constructor(private sql: postgres.Sql) {}

    public async save(invoice: InvoiceRecord): Promise<void> {
        await this.sql`
            INSERT INTO invoices (
                id, reference_id, merchant_id, amount_sompi, currency, status,
                created_at, expires_at, completed_at, payment_address, metadata, events
            ) VALUES (
                ${invoice.id},
                ${(invoice as any).referenceId || ''},
                ${invoice.merchantId},
                ${invoice.amount.toString()},
                ${invoice.currency},
                ${invoice.status},
                ${invoice.createdAt},
                ${(invoice as any).expiresAt || ''},
                ${(invoice as any).completedAt || null},
                ${(invoice as any).paymentAddress || invoice.uri},
                ${(invoice as any).metadata ? this.sql.json((invoice as any).metadata) : null},
                ${(invoice as any).events ? this.sql.json((invoice as any).events) : null}
            )
            ON CONFLICT (id) DO UPDATE SET
                status = EXCLUDED.status,
                completed_at = EXCLUDED.completed_at,
                metadata = EXCLUDED.metadata,
                events = EXCLUDED.events
        `;
    }

    public async get(id: string): Promise<InvoiceRecord | undefined> {
        const rows = await this.sql`SELECT * FROM invoices WHERE id = ${id}`;
        if (rows.length === 0) return undefined;
        return this.mapRow(rows[0]);
    }

    public async list(): Promise<InvoiceRecord[]> {
        const rows = await this.sql`SELECT * FROM invoices`;
        return rows.map(r => this.mapRow(r));
    }

    public async listByMerchant(merchantId: string): Promise<InvoiceRecord[]> {
        const rows = await this.sql`SELECT * FROM invoices WHERE merchant_id = ${merchantId}`;
        return rows.map(r => this.mapRow(r));
    }

    public async listPaid(): Promise<InvoiceRecord[]> {
        const rows = await this.sql`SELECT * FROM invoices WHERE status = 'paid'`;
        return rows.map(r => this.mapRow(r));
    }

    public async stats(merchantId?: string): Promise<{ totalInvoices: number; paidInvoices: number }> {
        if (merchantId) {
            const result = await this.sql`
                SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'paid') as paid
                FROM invoices
                WHERE merchant_id = ${merchantId}
            `;
            return {
                totalInvoices: Number(result[0].total),
                paidInvoices: Number(result[0].paid)
            };
        } else {
            const result = await this.sql`
                SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'paid') as paid
                FROM invoices
            `;
            return {
                totalInvoices: Number(result[0].total),
                paidInvoices: Number(result[0].paid)
            };
        }
    }

    private mapRow(row: any): InvoiceRecord {
        return {
            id: row.id,
            merchantId: row.merchant_id,
            amount: BigInt(row.amount_sompi),
            currency: row.currency,
            status: row.status,
            uri: row.payment_address,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}
