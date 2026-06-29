import { DomainStoreJson } from '@hardkas/query-store';

export interface InvoiceRecord {
    id: string;
    merchantId: string;
    amount: bigint;
    currency: string;
    status: 'pending' | 'paid' | 'cancelled';
    uri: string;
    createdAt: string;
    updatedAt: string;
}

export interface InvoiceStore {
    save(invoice: InvoiceRecord): Promise<void> | void;
    get(id: string): Promise<InvoiceRecord | undefined> | InvoiceRecord | undefined;
    list(): Promise<InvoiceRecord[]> | InvoiceRecord[];
    listByMerchant(merchantId: string): Promise<InvoiceRecord[]> | InvoiceRecord[];
    listPaid(): Promise<InvoiceRecord[]> | InvoiceRecord[];
    stats(merchantId?: string): Promise<{ totalInvoices: number; paidInvoices: number }> | { totalInvoices: number; paidInvoices: number };
}

export class InvoiceStoreJson implements InvoiceStore {
    private store: DomainStoreJson<InvoiceRecord>;

    constructor(options: { filePath: string }) {
        this.store = new DomainStoreJson<InvoiceRecord>(options);
    }

    public save(invoice: InvoiceRecord): void {
        invoice.updatedAt = new Date().toISOString();
        this.store.save(invoice.id, invoice);
    }

    public get(id: string): InvoiceRecord | undefined {
        return this.store.get(id);
    }

    public list(): InvoiceRecord[] {
        return this.store.list();
    }

    public listByMerchant(merchantId: string): InvoiceRecord[] {
        return this.store.list().filter(i => i.merchantId === merchantId);
    }

    public listPaid(): InvoiceRecord[] {
        return this.store.list().filter(i => i.status === 'paid');
    }

    public stats(merchantId?: string) {
        let invoices = this.store.list();
        if (merchantId) {
            invoices = invoices.filter(i => i.merchantId === merchantId);
        }
        
        return {
            totalInvoices: invoices.length,
            paidInvoices: invoices.filter(i => i.status === 'paid').length
        };
    }
}
