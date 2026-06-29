import { randomUUID } from 'node:crypto';
import { WalletManager, AddressManager } from '@hardkas/accounts';

/**
 * Merchant Checkout Service — Builder Lab 02
 * 
 * A merchant wants to:
 * 1. Create an invoice for a customer
 * 2. Give the customer a Kaspa payment URI / QR
 * 3. Wait for the customer to pay
 * 4. Detect the payment (0-conf first, then confirmed)
 * 5. Mark the invoice as paid
 * 6. Emit evidence of the payment
 */

export type InvoiceStatus = "pending" | "detecting" | "mempool" | "confirmed" | "expired" | "cancelled";

export type Currency = "KAS";

export interface Invoice {
    id: string;
    merchantId: string;
    amountSompi: bigint;
    currency: Currency;
    memo: string;
    paymentAddress: string;
    status: InvoiceStatus;
    createdAt: number;
    expiresAt: number;
    paidAt?: number;
    txId?: string;
    confirmations: number;
    requiredConfirmations: number;
}

interface MerchantState {
    nextInvoiceAddressIndex: number;
}

export class CheckoutService {
    private invoices: Map<string, Invoice> = new Map();
    private merchants: Map<string, MerchantState> = new Map();

    constructor() {}

    /**
     * Register a merchant wallet so we can derive per-invoice addresses.
     * Uses WalletManager from Lab 01 — SECOND CONSUMER.
     */
    public registerMerchant(merchantId: string): void {
        // FRICTION #01 RESOLUTION: WalletManager + AddressManager from Lab 01 work here without changes.
        WalletManager.create({ walletId: merchantId, network: "simnet" });
        this.merchants.set(merchantId, { nextInvoiceAddressIndex: 0 });
    }

    /**
     * POST /invoice
     * 
     * A merchant creates an invoice for a customer purchase.
     */
    public async createInvoice(opts: {
        merchantId: string;
        amountSompi: bigint;
        memo: string;
        expiresInMs?: number;
    }): Promise<Invoice> {
        const id = randomUUID();

        // Ensure merchant is registered
        const merchant = this.merchants.get(opts.merchantId);
        if (!merchant) throw new Error("Merchant not registered. Call registerMerchant() first.");

        // FRICTION #01 RESOLVED: Derive a unique address per invoice using Lab 01 helpers.
        // WalletManager provides seedRef, AddressManager derives deterministically.
        // This is the SECOND CONSUMER of both helpers.
        const seedRef = WalletManager.getSeedRef(opts.merchantId);
        const addressIndex = merchant.nextInvoiceAddressIndex++;
        const derived = AddressManager.deriveReceive({
            seedRef,
            accountIndex: 0,
            addressIndex
        });
        const paymentAddress = derived.address;

        // FRICTION #03 RESOLVED: Use SDK's ConfirmationPolicy to dynamically determine required confirmations.
        const hkCore = await import('@hardkas/core');
        const policyResult = hkCore.getRequiredConfirmations({
            amountSompi: opts.amountSompi,
            riskProfile: "standard"
        });
        const requiredConfirmations = policyResult.requiredConfirmations;

        const now = Date.now();
        const expiresInMs = opts.expiresInMs ?? 15 * 60 * 1000; // 15 minutes default

        const invoice: Invoice = {
            id,
            merchantId: opts.merchantId,
            amountSompi: opts.amountSompi,
            currency: "KAS",
            memo: opts.memo,
            paymentAddress,
            status: "pending",
            createdAt: now,
            expiresAt: now + expiresInMs,
            confirmations: 0,
            requiredConfirmations
        };

        this.invoices.set(id, invoice);
        return invoice;
    }

    /**
     * GET /invoice/:id
     */
    public async getInvoice(invoiceId: string): Promise<Invoice> {
        const invoice = this.invoices.get(invoiceId);
        if (!invoice) throw new Error("Invoice not found");
        return invoice;
    }

    /**
     * GET /invoice/:id/payment-uri
     * 
     * Returns a kaspa: URI that a wallet can scan.
     * Example: kaspa:qqaddr?amount=1000000&label=Coffee
     */
    public async getPaymentUri(invoiceId: string): Promise<string> {
        const invoice = await this.getInvoice(invoiceId);

        // FRICTION #02 RESOLVED: Use SDK's KaspaURIBuilder for safe generation
        const hk = await import('@hardkas/tx-builder');
        
        const result = hk.buildKaspaUri({
            address: invoice.paymentAddress,
            amountSompi: invoice.amountSompi,
            label: invoice.memo
        });

        return result.uri;
    }

    /**
     * GET /invoice/:id/qr
     * 
     * Returns data needed to generate a QR code for the payment.
     */
    public async getQrData(invoiceId: string): Promise<{ uri: string; data: string }> {
        const uri = await this.getPaymentUri(invoiceId);

        // FRICTION: We need to generate a QR code.
        // This is probably a plugin concern, not core SDK.
        // But even generating the data for the QR needs the URI to be correct first.
        // For now, just return the URI string as the QR data.
        return {
            uri,
            data: uri // A QR library would encode this
        };
    }

    /**
     * POST /invoice/:id/check
     * 
     * Check if a payment has been received for this invoice.
     * This is the polling endpoint — the merchant's backend calls this periodically.
     */
    public async checkPayment(invoiceId: string): Promise<Invoice> {
        const invoice = this.invoices.get(invoiceId);
        if (!invoice) throw new Error("Invoice not found");

        // Check expiration
        if (invoice.status === "pending" && Date.now() > invoice.expiresAt) {
            invoice.status = "expired" as InvoiceStatus;
            // TypeScript readonly workaround — in real code we'd use a proper state machine
            (this.invoices.get(invoiceId) as any).status = "expired";
            return invoice;
        }

        // FRICTION #04 RESOLVED: Use SDK's PaymentTracker which is stateless and relies on WalletQuery.
        const hkQuery = await import('@hardkas/query');

        // In a real app, the queryEngine is injected into CheckoutService.
        // For Lab 02 V1, we instantiate a dummy provider on the fly if not injected.
        if (!(this as any).queryEngine) {
            (this as any).queryEngine = new hkQuery.WalletQuery({
                provider: {
                    source: "mock",
                    getBalances: async () => ({}),
                    getUtxos: async () => ({}), // A mock provider would return UTXOs here
                    getHistory: async () => ({ items: [] })
                }
            });
        }

        const result = await hkQuery.checkPaymentStatus({
            address: invoice.paymentAddress,
            expectedAmountSompi: invoice.amountSompi,
            requiredConfirmations: invoice.requiredConfirmations,
            queryEngine: (this as any).queryEngine
        });

        if (result.status === "confirmed") {
            return await this.markPaid(invoice.id, result.txId!, result.confirmations);
        } else if (result.status === "mempool") {
            (this.invoices.get(invoiceId) as any).status = "mempool";
            (this.invoices.get(invoiceId) as any).confirmations = result.confirmations;
        }

        return this.invoices.get(invoiceId)!;
    }

    /**
     * GET /invoice/:id/status
     * 
     * Simple status check — no side effects.
     */
    public async getStatus(invoiceId: string): Promise<{
        invoiceId: string;
        status: InvoiceStatus;
        confirmations: number;
        requiredConfirmations: number;
        paid: boolean;
    }> {
        const invoice = await this.getInvoice(invoiceId);
        return {
            invoiceId: invoice.id,
            status: invoice.status,
            confirmations: invoice.confirmations,
            requiredConfirmations: invoice.requiredConfirmations,
            paid: invoice.status === "confirmed"
        };
    }

    /**
     * Internal: Mark an invoice as paid.
     * Would be called by the PaymentTracker when it detects enough confirmations.
     */
    public async markPaid(invoiceId: string, txId: string, confirmations: number): Promise<Invoice> {
        const invoice = this.invoices.get(invoiceId);
        if (!invoice) throw new Error("Invoice not found");

        // FRICTION #05 RESOLVED: We emit a PaymentReceipt evidence artifact
        const hkArtifacts = await import('@hardkas/artifacts');
        
        const receipt = hkArtifacts.createPaymentReceipt({
            invoice: {
                id: invoice.id,
                merchantId: invoice.merchantId,
                paymentAddress: invoice.paymentAddress,
                amountSompi: invoice.amountSompi
            },
            paymentCheckResult: {
                status: "confirmed",
                amountFoundSompi: invoice.amountSompi,
                txId,
                confirmations
            },
            policyResult: {
                requiredConfirmations: invoice.requiredConfirmations,
                riskProfile: "standard"
            }
        });

        // Mutate (in production this would be a proper state transition)
        (invoice as any).status = "confirmed";
        (invoice as any).paidAt = Date.now();
        (invoice as any).txId = txId;
        (invoice as any).confirmations = confirmations;

        // In a fully integrated app we would use hk.artifacts.write(receipt)
        // Here we write it manually to the workspace artifacts directory.
        const path = await import('node:path');
        const fs = await import('node:fs');
        const artifactsDir = path.join(process.cwd(), 'artifacts');
        if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
        
        await hkArtifacts.writeArtifact(path.join(artifactsDir, `payment-receipt-${invoice.id}.json`), receipt);

        return invoice;
    }
}
