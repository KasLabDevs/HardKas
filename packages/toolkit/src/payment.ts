import { buildKaspaUri, covenantIdOf } from '@hardkas/tx-builder';
import { EvidenceBatchExporter } from '@hardkas/artifacts';
import { HardkasError, addressPrefixNetworkHint, assertMainnetConnectionsDisabled } from '@hardkas/core';
import { InvoiceStoreJson, InvoiceRecord, InvoiceStore } from './stores/invoice-store.js';

const SOMPI_PER_KAS = 100_000_000n;

/**
 * G6 (notes cross-check) · a node the toolkit asks whether an invoice was paid: anything that lists the UTXOs at an
 * address the way @hardkas/kaspa-rpc's clients do (`{ outpoint: { transactionId, index }, amountSompi, covenantId? }`).
 */
export interface PaymentNodeBackend {
    getUtxosByAddress(address: string): Promise<ReadonlyArray<unknown>>;
}

export interface PaymentToolkitOptions {
    storePath?: string;
    storage?: any;
    /**
     * G6: the node `check()` asks. Without it `check()` asks nobody and refuses (PAYMENT_CHECK_NO_NODE) instead of
     * returning a stored status as if it had checked. The merchant id is the address read from the node.
     */
    rpc?: PaymentNodeBackend;
}

/** How a paid invoice came to be paid: `simulated` (simulatePay(), nothing observed) or `node-observed` (check() on a node). */
export type PaymentSettlement = "simulated" | "node-observed";

/** G6: what this toolkit adds to an invoice record (the store keeps the fields it is given). */
export interface PaymentInvoiceDetails {
    /** The invoice amount, exact, in sompi. `amount` is whole KAS and truncates (0.5 KAS is 0): use this one. */
    amountSompi?: bigint;
    /** Set once the invoice is paid. A record paid before this field existed was paid by simulatePay(). */
    settlement?: PaymentSettlement;
    /** node-observed only: the plain KAS check() found and credited to this invoice (an overpayment shows here). */
    amountFoundSompi?: bigint;
    /** node-observed only: every transaction whose outputs paid this invoice. */
    txIds?: string[];
    /** node-observed only: the outpoints (`txid:index`) credited to this invoice; no other invoice of the merchant counts them. */
    paidOutpoints?: string[];
    paidAt?: string;
}

export type PaymentInvoice = InvoiceRecord & PaymentInvoiceDetails;

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

    public async createInvoice(opts: { amount?: bigint; amountSompi?: bigint; currency?: string }): Promise<PaymentInvoice> {
        if (opts.amount === undefined && opts.amountSompi === undefined) {
            throw new Error("Must provide either amount or amountSompi");
        }
        if (opts.amount !== undefined && opts.amountSompi !== undefined && opts.amount * SOMPI_PER_KAS !== opts.amountSompi) {
            throw new HardkasError(
                "PAYMENT_INVOICE_AMOUNT_CONTRADICTORY",
                `PaymentToolkit.createInvoice: amount ${opts.amount} KAS and amountSompi ${opts.amountSompi} name different amounts. Give one of them. No invoice was created.`,
                { metadata: { amount: opts.amount.toString(), amountSompi: opts.amountSompi.toString() } }
            );
        }

        const sompi = opts.amountSompi ?? (opts.amount! * SOMPI_PER_KAS);
        // the legacy whole-KAS field; it truncates (G6: 0.5 KAS was stored as 0 and nothing else): amountSompi is exact
        const kas = opts.amount ?? (sompi / SOMPI_PER_KAS);
        const curr = opts.currency ?? 'KAS';

        const id = `inv_${Date.now()}`;
        const result = buildKaspaUri({
            // L1-07: the merchant's address is its own URI scheme; it used to be prefixed again ("kaspa:kaspa:...")
            address: this.merchantId,
            amountSompi: sompi,
            message: `Invoice ${id}`
        });

        const invoice: PaymentInvoice = {
            id,
            merchantId: this.merchantId,
            amount: kas,
            amountSompi: sompi,
            currency: curr,
            status: 'pending',
            uri: result.uri,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await this.store.save(invoice);
        return invoice;
    }

    public async getInvoice(id: string): Promise<PaymentInvoice | undefined> {
        return await this.store.get(id);
    }

    public async listInvoices(): Promise<PaymentInvoice[]> {
        return await this.store.listByMerchant(this.merchantId);
    }

    public async stats(): Promise<{ totalInvoices: number; paidInvoices: number }> {
        return await this.store.stats(this.merchantId);
    }

    /**
     * Whether the invoice is paid, asked of the node (`options.rpc`): `paid`, `partially_paid` or `pending`; `not_found`
     * for an unknown invoice and `cancelled` for a cancelled one. G6: without a node it used to return the stored status
     * (a flag simulatePay() sets) as if it had checked; now it refuses with PAYMENT_CHECK_NO_NODE and says what is stored.
     * Only plain KAS counts (a covenant-bound coin is not a payment), and a coin already credited to another invoice of
     * this merchant is not counted again. Every invoice of a merchant pays to its one address (the merchant id), so a coin
     * that was there before the invoice existed counts too: "paid" means the node lists enough uncredited plain KAS at
     * the address, not that this customer paid it.
     */
    public async check(invoiceId: string): Promise<string> {
        const inv: PaymentInvoice | undefined = await this.store.get(invoiceId);
        if (!inv) return 'not_found';
        if (!this.options.rpc) {
            const settlement = settlementOf(inv);
            throw new HardkasError(
                "PAYMENT_CHECK_NO_NODE",
                `PaymentToolkit.check(${invoiceId}): this toolkit has no node (options.rpc), so no node was asked and nothing was checked. ` +
                    `The stored status is '${inv.status}'` +
                    (settlement === "simulated" ? " (set by simulatePay(): a simulation; no payment was observed)" : "") +
                    `. Read it with getInvoice(); open the toolkit with { rpc } to check a payment on a node.`,
                { metadata: { invoiceId, checked: false, storedStatus: inv.status, settlement: settlement ?? null } }
            );
        }
        if (inv.status === 'cancelled') return 'cancelled';
        if (inv.status === 'paid' && inv.settlement === 'node-observed') return 'paid';
        return this.checkOnNode(inv);
    }

    private async checkOnNode(inv: PaymentInvoice): Promise<string> {
        const address = this.merchantId;
        // reads only, but never from mainnet: the transport refuses a mainnet node, and a mainnet address is refused here
        assertMainnetConnectionsDisabled([addressPrefixNetworkHint(address)], `PaymentToolkit.check(${inv.id})`);
        const expected = invoiceAmountSompi(inv);
        let utxos: ReadonlyArray<any>;
        try {
            utxos = await this.options.rpc!.getUtxosByAddress(address);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            throw new HardkasError(
                "PAYMENT_CHECK_NODE_FAILED",
                `PaymentToolkit.check(${inv.id}): the node could not list the UTXOs of ${address} (${message}). Nothing was checked or marked paid.`,
                { cause: e, metadata: { invoiceId: inv.id, address, checked: false } }
            );
        }
        // one payment, one order: an outpoint credited to another invoice of this merchant pays nothing more
        const credited = new Set<string>();
        for (const other of (await this.store.listByMerchant(this.merchantId)) as PaymentInvoice[]) {
            if (other.id === inv.id) continue;
            for (const o of other.paidOutpoints ?? []) credited.add(o);
        }
        let found = 0n;
        const outpoints: string[] = [];
        const txIds: string[] = [];
        for (const u of utxos ?? []) {
            // a coin with a covenant id belongs to a covenant (KIP-20): it is not plain KAS
            if (covenantIdOf(u) !== undefined) continue;
            const txid = String(u?.outpoint?.transactionId ?? u?.transactionId ?? "");
            const index = Number(u?.outpoint?.index ?? u?.outputIndex ?? u?.index);
            if (txid === "" || !Number.isInteger(index)) continue;
            const key = `${txid}:${index}`;
            if (credited.has(key)) continue;
            found += BigInt(u?.amountSompi ?? u?.utxoEntry?.amount ?? 0);
            outpoints.push(key);
            if (!txIds.includes(txid)) txIds.push(txid);
        }
        if (found > 0n && found >= expected) {
            inv.status = 'paid';
            inv.settlement = 'node-observed';
            inv.amountFoundSompi = found;
            inv.txIds = txIds;
            inv.paidOutpoints = outpoints;
            inv.paidAt = new Date().toISOString();
            await this.store.save(inv);
            return 'paid';
        }
        return found > 0n ? 'partially_paid' : 'pending';
    }

    /**
     * The invoice's receipt. G6: a receipt of an invoice simulatePay() marked paid is SYNTHETIC — schema
     * `hardkas.synthetic.paymentReceipt.v1`, `synthetic: true`, `settlement: "simulated"`, no transaction — so it is never
     * mistaken for one a node backs (`paymentReceipt.v1`, `settlement: "node-observed"`, with the paying transactions).
     */
    public async receipt(invoiceId: string): Promise<any> {
        const inv: PaymentInvoice | undefined = await this.store.get(invoiceId);
        if (!inv) throw new Error("Invoice not found");
        if (inv.status !== "paid") throw new Error("Invoice is not paid");

        const amountSompi = inv.amountSompi ?? inv.amount * SOMPI_PER_KAS;
        if (inv.settlement === "node-observed") {
            return {
                schema: "paymentReceipt.v1",
                invoiceId,
                merchantId: this.merchantId,
                status: "paid",
                timestamp: new Date().toISOString(),
                amount: inv.amount,
                amountSompi: amountSompi.toString(),
                currency: inv.currency,
                synthetic: false,
                settlement: "node-observed",
                evidence: "node-utxo-observation",
                address: this.merchantId,
                amountFoundSompi: (inv.amountFoundSompi ?? 0n).toString(),
                txIds: [...(inv.txIds ?? [])],
                outpoints: [...(inv.paidOutpoints ?? [])],
                ...(inv.paidAt ? { paidAt: inv.paidAt } : {})
            };
        }
        return {
            schema: "hardkas.synthetic.paymentReceipt.v1",
            invoiceId,
            merchantId: this.merchantId,
            status: "paid",
            timestamp: new Date().toISOString(),
            amount: inv.amount,
            amountSompi: amountSompi.toString(),
            currency: inv.currency,
            synthetic: true,
            settlement: "simulated",
            evidence: "none",
            notice: "SIMULATED: simulatePay() marked this invoice paid in the toolkit's own store. No node was asked and no transaction exists; this is not evidence of a payment."
        };
    }

    /** For lab testing/simulation: marks an invoice paid in the store, without any payment (G6: its receipt is synthetic). */
    public async simulatePay(invoiceId: string): Promise<void> {
        const inv: PaymentInvoice | undefined = await this.store.get(invoiceId);
        if (inv) {
            // an invoice a node already showed paid keeps that settlement
            if (inv.status === 'paid' && inv.settlement === 'node-observed') return;
            inv.status = 'paid';
            inv.settlement = 'simulated';
            await this.store.save(inv);
        }
    }
}

function settlementOf(inv: PaymentInvoice): PaymentSettlement | undefined {
    if (inv.status !== 'paid') return undefined;
    // before G6 only simulatePay() could mark an invoice paid
    return inv.settlement ?? 'simulated';
}

function invoiceAmountSompi(inv: PaymentInvoice): bigint {
    if (inv.amountSompi !== undefined) return BigInt(inv.amountSompi);
    const legacy = BigInt(inv.amount) * SOMPI_PER_KAS;
    if (legacy <= 0n) {
        // a record written before amounts were kept in sompi, for less than 1 KAS: its whole-KAS amount truncated to 0
        throw new HardkasError(
            "PAYMENT_INVOICE_AMOUNT_UNKNOWN",
            `PaymentToolkit.check(${inv.id}): this invoice was stored without its amount in sompi and its whole-KAS amount is ${inv.amount}; the amount due is unknown, so nothing was checked. Create the invoice again.`,
            { metadata: { invoiceId: inv.id, checked: false } }
        );
    }
    return legacy;
}
