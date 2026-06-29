import { buildKaspaUri } from '@hardkas/tx-builder';
import { EvidenceBatchExporter } from '@hardkas/artifacts';
import { InvoiceStoreJson, InvoiceRecord } from './stores/invoice-store.js';

export interface PaymentToolkitOptions {
    storePath?: string;
}

export class PaymentToolkit {
    private store: InvoiceStoreJson;

    private constructor(
        public readonly merchantId: string,
        private readonly options: PaymentToolkitOptions
    ) {
        this.store = new InvoiceStoreJson({ filePath: options.storePath || '.hardkas-data/invoices.json' });
    }

    public static openMerchant(merchantId: string, options: PaymentToolkitOptions = {}): PaymentToolkit {
        return new PaymentToolkit(merchantId, options);
    }

    public async createInvoice(opts: { amount: bigint; currency: string }): Promise<InvoiceRecord> {
        const id = `inv_${Date.now()}`;
        const result = buildKaspaUri({
            address: `kaspa:${this.merchantId}`,
            amountSompi: opts.amount * 100_000_000n, // convert to sompi
            message: `Invoice ${id}`
        });

        const invoice: InvoiceRecord = {
            id,
            merchantId: this.merchantId,
            amount: opts.amount,
            currency: opts.currency,
            status: 'pending',
            uri: result.uri,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.store.save(invoice);
        return invoice;
    }

    public async getInvoice(id: string): Promise<InvoiceRecord | undefined> {
        return this.store.get(id);
    }

    public async listInvoices(): Promise<InvoiceRecord[]> {
        return this.store.listByMerchant(this.merchantId);
    }

    public async stats(): Promise<{ totalInvoices: number; paidInvoices: number }> {
        return this.store.stats(this.merchantId);
    }

    public async check(invoiceId: string): Promise<string> {
        const inv = this.store.get(invoiceId);
        return inv ? inv.status : 'not_found';
    }

    public async receipt(invoiceId: string): Promise<any> {
        return {
            schema: "paymentReceipt.v1",
            invoiceId,
            merchantId: this.merchantId,
            status: "paid",
            timestamp: new Date().toISOString()
        };
    }
    
    // For lab testing/simulation manually paying an invoice
    public async simulatePay(invoiceId: string): Promise<void> {
        const inv = this.store.get(invoiceId);
        if (inv) {
            inv.status = 'paid';
            this.store.save(inv);
        }
    }
}
