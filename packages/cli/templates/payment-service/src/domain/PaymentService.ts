import { randomUUID } from 'node:crypto';
import { WalletManager, AddressManager } from '@hardkas/accounts';
import { getRequiredConfirmations } from '@hardkas/core';
import { buildKaspaUri } from '@hardkas/tx-builder';
import { WalletQuery, checkPaymentStatus } from '@hardkas/query';
import { createPaymentReceipt, writeArtifact, PaymentReceiptArtifactV1 } from '@hardkas/artifacts';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { WebhookTransport, WebhookEvent } from './WebhookTransport.js';

export type InvoiceStatus = "pending" | "detecting" | "mempool" | "confirmed" | "expired" | "cancelled";

export interface Invoice {
    id: string;
    merchantId: string;
    amountSompi: bigint;
    currency: "KAS";
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
    webhookUrl?: string;
}

export class PaymentService {
    private invoices: Map<string, Invoice> = new Map();
    private merchants: Map<string, MerchantState> = new Map();
    private queryEngine: WalletQuery;
    private webhookTransport: WebhookTransport;
    private artifactsDir: string;

    constructor(queryEngine: WalletQuery, webhookTransport: WebhookTransport, artifactsDir?: string) {
        this.queryEngine = queryEngine;
        this.webhookTransport = webhookTransport;
        this.artifactsDir = artifactsDir ?? path.join(process.cwd(), 'artifacts');
        if (!fs.existsSync(this.artifactsDir)) fs.mkdirSync(this.artifactsDir, { recursive: true });
    }

    public registerMerchant(merchantId: string, webhookUrl?: string): void {
        WalletManager.create({ walletId: merchantId, network: "simnet" });
        this.merchants.set(merchantId, { nextInvoiceAddressIndex: 0, webhookUrl });
    }

    public async createInvoice(opts: {
        merchantId: string;
        amountSompi: bigint;
        memo: string;
        expiresInMs?: number;
    }): Promise<Invoice> {
        const id = randomUUID();
        const merchant = this.merchants.get(opts.merchantId);
        if (!merchant) throw new Error("Merchant not registered.");

        const seedRef = WalletManager.getSeedRef(opts.merchantId);
        const addressIndex = merchant.nextInvoiceAddressIndex++;
        const derived = AddressManager.deriveReceive({
            seedRef,
            accountIndex: 0,
            addressIndex
        });

        const policyResult = getRequiredConfirmations({
            amountSompi: opts.amountSompi,
            riskProfile: "standard"
        });

        const now = Date.now();
        const invoice: Invoice = {
            id,
            merchantId: opts.merchantId,
            amountSompi: opts.amountSompi,
            currency: "KAS",
            memo: opts.memo,
            paymentAddress: derived.address,
            status: "pending",
            createdAt: now,
            expiresAt: now + (opts.expiresInMs ?? 15 * 60 * 1000),
            confirmations: 0,
            requiredConfirmations: policyResult.requiredConfirmations
        };

        this.invoices.set(id, invoice);
        return invoice;
    }

    public async getInvoice(invoiceId: string): Promise<Invoice> {
        const invoice = this.invoices.get(invoiceId);
        if (!invoice) throw new Error("Invoice not found");
        return invoice;
    }

    public async getPaymentUri(invoiceId: string): Promise<string> {
        const invoice = await this.getInvoice(invoiceId);
        const result = buildKaspaUri({
            address: invoice.paymentAddress,
            amountSompi: invoice.amountSompi,
            label: invoice.memo
        });
        return result.uri;
    }

    public async checkPayment(invoiceId: string): Promise<Invoice> {
        const invoice = await this.getInvoice(invoiceId);

        if (invoice.status === "pending" && Date.now() > invoice.expiresAt) {
            invoice.status = "expired";
            return invoice;
        }
        if (invoice.status === "confirmed") {
            return invoice;
        }

        const result = await checkPaymentStatus({
            address: invoice.paymentAddress,
            expectedAmountSompi: invoice.amountSompi,
            requiredConfirmations: invoice.requiredConfirmations,
            queryEngine: this.queryEngine
        });

        if (result.status === "confirmed") {
            return await this.markPaid(invoice.id, result.txId!, result.confirmations);
        } else if (result.status === "mempool") {
            invoice.status = "mempool";
            invoice.confirmations = result.confirmations;
        }

        return invoice;
    }

    private async markPaid(invoiceId: string, txId: string, confirmations: number): Promise<Invoice> {
        const invoice = await this.getInvoice(invoiceId);
        const receipt = createPaymentReceipt({
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

        invoice.status = "confirmed";
        invoice.paidAt = Date.now();
        invoice.txId = txId;
        invoice.confirmations = confirmations;

        await writeArtifact(path.join(this.artifactsDir, `payment-receipt-${invoice.id}.json`), receipt);
        
        const merchant = this.merchants.get(invoice.merchantId);
        if (merchant?.webhookUrl) {
            const event: WebhookEvent = {
                id: randomUUID(),
                type: "invoice.paid",
                payload: { invoiceId: invoice.id, txId, amountSompi: invoice.amountSompi.toString() },
                timestamp: Date.now()
            };
            await this.webhookTransport.send(merchant.webhookUrl, event);
        }

        return invoice;
    }

    public async reconciliation(merchantId: string): Promise<{ totalPaidSompi: bigint; onchainBalanceSompi: bigint; match: boolean }> {
        const merchant = this.merchants.get(merchantId);
        if (!merchant) throw new Error("Merchant not found");

        let totalPaidSompi = 0n;
        const addresses: string[] = [];

        for (const inv of this.invoices.values()) {
            if (inv.merchantId === merchantId && inv.status === "confirmed") {
                totalPaidSompi += inv.amountSompi;
                addresses.push(inv.paymentAddress);
            }
        }

        const balanceResult = await this.queryEngine.getBalance(addresses);
        let onchainBalanceSompi = 0n;
        if (balanceResult.ok) {
            onchainBalanceSompi = balanceResult.balanceSompi;
        }

        return {
            totalPaidSompi,
            onchainBalanceSompi,
            match: totalPaidSompi === onchainBalanceSompi
        };
    }

    public async exportEvidence(merchantId: string): Promise<PaymentReceiptArtifactV1[]> {
        const receipts: PaymentReceiptArtifactV1[] = [];
        for (const inv of this.invoices.values()) {
            if (inv.merchantId === merchantId && inv.status === "confirmed") {
                const p = path.join(this.artifactsDir, `payment-receipt-${inv.id}.json`);
                if (fs.existsSync(p)) {
                    const data = fs.readFileSync(p, 'utf-8');
                    receipts.push(JSON.parse(data));
                }
            }
        }
        return receipts;
    }
}
