import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PaymentToolkit } from '../src/payment.js';

// G6 (notes cross-check, 16-accepting-payments): PaymentToolkit.check() never asked a node, receipt() returned
// `schema: "paymentReceipt.v1", status: "paid"` from a flag simulatePay() set, and an invoice of 0.5 KAS was stored as 0.
// Now: amounts are kept in sompi; check() asks the node it is given (plain KAS only, one coin pays one invoice) and
// refuses without one; a simulated receipt is synthetic and a node-backed one names its transactions. A fake node stands in.

const MERCHANT = 'kaspasim:qmerchant';
const COVENANT = 'ab'.repeat(32);

function fakeNode(entries: Array<{ txid: string; index: number; amount: bigint; covenantId?: string }>) {
    const calls: string[] = [];
    return {
        calls,
        entries,
        async getUtxosByAddress(address: string) {
            calls.push(address);
            return entries.map((e) => ({
                address,
                outpoint: { transactionId: e.txid, index: e.index },
                amountSompi: e.amount,
                blockDaaScore: 10n,
                isCoinbase: false,
                ...(e.covenantId ? { covenantId: e.covenantId } : {})
            }));
        }
    };
}

describe('G6 · PaymentToolkit: exact amounts, a real check, receipts that say what they are', () => {
    let dir: string;
    let n = 0;
    const storePath = () => path.join(dir, `invoices-${n++}.json`);

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-g6-payment-'));
    });
    afterAll(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('an invoice of 0.5 KAS keeps 50,000,000 sompi (it was stored as 0 and nothing else)', async () => {
        const pt = PaymentToolkit.openMerchant(MERCHANT, { storePath: storePath() });
        const inv = await pt.createInvoice({ amountSompi: 50_000_000n });
        expect(inv.amountSompi).toBe(50_000_000n);
        expect(inv.amount).toBe(0n); // the legacy whole-KAS field, unchanged
        const stored = await pt.getInvoice(inv.id);
        expect(stored?.amountSompi).toBe(50_000_000n);
    });

    it('amount and amountSompi that disagree are refused', async () => {
        const pt = PaymentToolkit.openMerchant(MERCHANT, { storePath: storePath() });
        await expect(pt.createInvoice({ amount: 1n, amountSompi: 50_000_000n })).rejects.toMatchObject({ code: 'PAYMENT_INVOICE_AMOUNT_CONTRADICTORY' });
        await expect(pt.createInvoice({ amount: 1n, amountSompi: 100_000_000n })).resolves.toMatchObject({ amountSompi: 100_000_000n });
    });

    it('with a node: unpaid → pending, under-paid → partially_paid, paid → paid with every paying transaction', async () => {
        const node = fakeNode([]);
        const pt = PaymentToolkit.openMerchant(MERCHANT, { storePath: storePath(), rpc: node });
        const inv = await pt.createInvoice({ amountSompi: 150_000_000n });
        expect(await pt.check(inv.id)).toBe('pending');
        expect(node.calls).toEqual([MERCHANT]);

        node.entries.push({ txid: 'tx-a', index: 0, amount: 100_000_000n });
        expect(await pt.check(inv.id)).toBe('partially_paid');
        expect((await pt.getInvoice(inv.id))?.status).toBe('pending');

        node.entries.push({ txid: 'tx-b', index: 1, amount: 60_000_000n });
        expect(await pt.check(inv.id)).toBe('paid');
        const paid = await pt.getInvoice(inv.id);
        expect(paid).toMatchObject({ status: 'paid', settlement: 'node-observed', amountFoundSompi: 160_000_000n, txIds: ['tx-a', 'tx-b'], paidOutpoints: ['tx-a:0', 'tx-b:1'] });

        const receipt = await pt.receipt(inv.id);
        expect(receipt).toMatchObject({
            schema: 'paymentReceipt.v1',
            synthetic: false,
            settlement: 'node-observed',
            evidence: 'node-utxo-observation',
            amountSompi: '150000000',
            amountFoundSompi: '160000000', // the overpayment is recorded
            txIds: ['tx-a', 'tx-b'],
            outpoints: ['tx-a:0', 'tx-b:1']
        });
    });

    it('a covenant-bound coin at the address is not a payment', async () => {
        const node = fakeNode([{ txid: 'tx-cov', index: 0, amount: 500_000_000n, covenantId: COVENANT }]);
        const pt = PaymentToolkit.openMerchant(MERCHANT, { storePath: storePath(), rpc: node });
        const inv = await pt.createInvoice({ amountSompi: 100_000_000n });
        expect(await pt.check(inv.id)).toBe('pending');
        expect((await pt.getInvoice(inv.id))?.status).toBe('pending');
    });

    it('one coin pays one invoice: a coin credited to one invoice does not pay the next', async () => {
        const node = fakeNode([{ txid: 'tx-one', index: 0, amount: 100_000_000n }]);
        const pt = PaymentToolkit.openMerchant(MERCHANT, { storePath: storePath(), rpc: node });
        const first = await pt.createInvoice({ amountSompi: 100_000_000n });
        // invoice ids are time-based (`inv_<ms>`): two in the same millisecond would be one record
        await new Promise((r) => setTimeout(r, 5));
        const second = await pt.createInvoice({ amountSompi: 100_000_000n });
        expect(second.id).not.toBe(first.id);
        expect(await pt.check(first.id)).toBe('paid');
        expect(await pt.check(second.id)).toBe('pending');
    });

    it('without a node: check() refuses (PAYMENT_CHECK_NO_NODE) and says it checked nothing; the receipt of simulatePay() is synthetic', async () => {
        const pt = PaymentToolkit.openMerchant(MERCHANT, { storePath: storePath() });
        const inv = await pt.createInvoice({ amountSompi: 100_000_000n });
        await expect(pt.check(inv.id)).rejects.toMatchObject({ code: 'PAYMENT_CHECK_NO_NODE', metadata: { checked: false, storedStatus: 'pending', settlement: null } });
        expect(await pt.check('inv_unknown')).toBe('not_found');
        await pt.simulatePay(inv.id);
        const receipt = await pt.receipt(inv.id);
        expect(receipt.schema).toBe('hardkas.synthetic.paymentReceipt.v1');
        expect(receipt.schema).not.toBe('paymentReceipt.v1');
        expect(receipt).toMatchObject({ synthetic: true, settlement: 'simulated', evidence: 'none' });
        expect(receipt.notice).toMatch(/^SIMULATED/);
        expect('txIds' in receipt || 'txId' in receipt).toBe(false);
    });

    it('a record marked paid before G6 (no settlement field) is treated as simulated', async () => {
        const file = storePath();
        const pt = PaymentToolkit.openMerchant(MERCHANT, { storePath: file });
        const inv = await pt.createInvoice({ amount: 2n });
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
        raw[inv.id].status = 'paid';
        delete raw[inv.id].settlement;
        delete raw[inv.id].amountSompi;
        fs.writeFileSync(file, JSON.stringify(raw));
        const reopened = PaymentToolkit.openMerchant(MERCHANT, { storePath: file });
        const receipt = await reopened.receipt(inv.id);
        expect(receipt).toMatchObject({ schema: 'hardkas.synthetic.paymentReceipt.v1', synthetic: true, amountSompi: '200000000' });
    });

    it('a node that fails is a typed error, not "pending"', async () => {
        const pt = PaymentToolkit.openMerchant(MERCHANT, {
            storePath: storePath(),
            rpc: { async getUtxosByAddress() { throw new Error('socket closed'); } }
        });
        const inv = await pt.createInvoice({ amountSompi: 100_000_000n });
        await expect(pt.check(inv.id)).rejects.toMatchObject({ code: 'PAYMENT_CHECK_NODE_FAILED', metadata: { checked: false } });
    });

    it('a mainnet merchant address is never read (MAINNET_CONNECTION_DISABLED)', async () => {
        const node = fakeNode([]);
        const pt = PaymentToolkit.openMerchant('kaspa:qmainnetmerchant', { storePath: storePath(), rpc: node });
        const inv = await pt.createInvoice({ amountSompi: 100_000_000n });
        await expect(pt.check(inv.id)).rejects.toMatchObject({ code: 'MAINNET_CONNECTION_DISABLED' });
        expect(node.calls).toEqual([]);
    });
});
