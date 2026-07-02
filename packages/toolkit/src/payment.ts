import { buildKaspaUri } from '@hardkas/tx-builder';
import { EvidenceBatchExporter } from '@hardkas/artifacts';
import { InvoiceStoreJson, InvoiceRecord, InvoiceStore } from './stores/invoice-store.js';

export interface PaymentToolkitOptions {
    storePath?: string;
    storage?: any;
}

export class PaymentToolkit {
    private store: InvoiceStore;

    private constructor(
        public readonly merchantId: string,
        private readonly options: PaymentToolkitOptions
    ) {
        if (options.storage) {
            this.store = options.storage.createInvoiceStore();
        } else {
            this.store = new InvoiceStoreJson({ filePath: options.storePath || '.hardkas-data/invoices.json' });
        }
    }

    public static openMerchant(merchantId: string, options: PaymentToolkitOptions = {}): PaymentToolkit {
        return new PaymentToolkit(merchantId, options);
    }

    public async createInvoice(opts: { amount?: bigint; amountSompi?: bigint; currency?: string }): Promise<InvoiceRecord> {
        if (opts.amount === undefined && opts.amountSompi === undefined) {
            throw new Error("Must provide either amount or amountSompi");
        }

        const sompi = opts.amountSompi ?? (opts.amount! * 100_000_000n);
        const kas = opts.amount ?? (opts.amountSompi! / 100_000_000n);
        const curr = opts.currency ?? 'KAS';

        const id = `inv_${Date.now()}`;
        const result = buildKaspaUri({
            address: `kaspa:${this.merchantId}`,
            amountSompi: sompi,
            message: `Invoice ${id}`
        });

        const invoice: InvoiceRecord = {
            id,
            merchantId: this.merchantId,
            amount: kas,
            currency: curr,
            status: 'pending',
            uri: result.uri,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await this.store.save(invoice);
        return invoice;
    }

    public async getInvoice(id: string): Promise<InvoiceRecord | undefined> {
        return await this.store.get(id);
    }

    public async listInvoices(): Promise<InvoiceRecord[]> {
        return await this.store.listByMerchant(this.merchantId);
    }

    public async stats(): Promise<{ totalInvoices: number; paidInvoices: number }> {
        return await this.store.stats(this.merchantId);
    }

    public async check(invoiceId: string): Promise<string> {
        const inv = await this.store.get(invoiceId);
        return inv ? inv.status : 'not_found';
    }

    public async receipt(invoiceId: string): Promise<any> {
        const inv = await this.store.get(invoiceId);
        if (!inv) throw new Error("Invoice not found");
        if (inv.status !== "paid") throw new Error("Invoice is not paid");

        return {
            schema: "paymentReceipt.v1",
            invoiceId,
            merchantId: this.merchantId,
            status: "paid",
            timestamp: new Date().toISOString(),
            amount: inv.amount,
            currency: inv.currency
        };
    }
    
    // For lab testing/simulation manually paying an invoice
    public async simulatePay(invoiceId: string): Promise<void> {
        const inv = await this.store.get(invoiceId);
        if (inv) {
            inv.status = 'paid';
            await this.store.save(inv);
        }
    }
}
