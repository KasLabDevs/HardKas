// no static import
import type { InvoiceStore, InvoiceRecord } from '@hardkas/toolkit';

export class InvoiceStoreSqlite implements InvoiceStore {
    constructor(private db: any) {}

    public save(invoice: InvoiceRecord): void {
        this.db.prepare(`
            INSERT OR REPLACE INTO invoices 
            (id, merchant_id, amount, currency, status, uri, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            invoice.id,
            invoice.merchantId,
            invoice.amount.toString(), // BigInt serialization
            invoice.currency,
            invoice.status,
            invoice.uri,
            invoice.createdAt,
            invoice.updatedAt || new Date().toISOString()
        );
    }

    public get(id: string): InvoiceRecord | undefined {
        const row = this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as any;
        if (!row) return undefined;
        return this.mapRow(row);
    }

    public list(): InvoiceRecord[] {
        const rows = this.db.prepare('SELECT * FROM invoices').all() as any[];
        return rows.map(r => this.mapRow(r));
    }

    public listByMerchant(merchantId: string): InvoiceRecord[] {
        const rows = this.db.prepare('SELECT * FROM invoices WHERE merchant_id = ?').all(merchantId) as any[];
        return rows.map(r => this.mapRow(r));
    }

    public listPaid(): InvoiceRecord[] {
        const rows = this.db.prepare('SELECT * FROM invoices WHERE status = ?').all('paid') as any[];
        return rows.map(r => this.mapRow(r));
    }

    public stats(merchantId?: string): { totalInvoices: number; paidInvoices: number } {
        if (merchantId) {
            const totalRow = this.db.prepare('SELECT COUNT(*) as c FROM invoices WHERE merchant_id = ?').get(merchantId) as any;
            const paidRow = this.db.prepare('SELECT COUNT(*) as c FROM invoices WHERE merchant_id = ? AND status = ?').get(merchantId, 'paid') as any;
            return { totalInvoices: totalRow.c, paidInvoices: paidRow.c };
        } else {
            const totalRow = this.db.prepare('SELECT COUNT(*) as c FROM invoices').get() as any;
            const paidRow = this.db.prepare('SELECT COUNT(*) as c FROM invoices WHERE status = ?').get('paid') as any;
            return { totalInvoices: totalRow.c, paidInvoices: paidRow.c };
        }
    }

    private mapRow(row: any): InvoiceRecord {
        return {
            id: row.id,
            merchantId: row.merchant_id,
            amount: BigInt(row.amount),
            currency: row.currency,
            status: row.status,
            uri: row.uri,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}
