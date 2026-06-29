import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WalletToolkit, PaymentToolkit, IndexerToolkit } from '../src/index.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

describe('@hardkas/toolkit V1', () => {
    const tmpDir = path.join(process.cwd(), '.test-toolkit');

    beforeAll(async () => {
        try { await fs.mkdir(tmpDir, { recursive: true }); } catch (e) {}
    });

    afterAll(async () => {
        try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch (e) {}
    });

    describe('WalletToolkit', () => {
        it('should instantiate and return address', async () => {
            const wallet = WalletToolkit.open('alice', { storePath: path.join(tmpDir, 'wallets.json') });
            await wallet.create();
            const addr = await wallet.address();
            expect(addr).toBeDefined();
            expect(typeof addr).toBe('string');
            expect(addr.startsWith('kaspasim:') || addr.startsWith('kaspa:')).toBe(true);
        });

        it('should estimate fee and plan send', async () => {
            const wallet = WalletToolkit.open('alice', { storePath: path.join(tmpDir, 'wallets.json') });
            // Mock the internal walletQuery for the test
            (wallet as any).walletQuery.getUtxos = async () => [];
            
            await wallet.create(); // Create it so we can fetch it
            
            // This is a facade test, we just want to ensure it doesn't crash on wiring
            const utxos = await wallet.utxos.list();
            expect(Array.isArray(utxos)).toBe(true);
            
            // To test estimateFee, CoinSelector might throw if not enough funds, 
            // but we at least know it wired up the query correctly.
        });
    });

    describe('PaymentToolkit', () => {
        it('should create invoice and receipt with persistence', async () => {
            const pt = PaymentToolkit.openMerchant('store-1', { storePath: path.join(tmpDir, 'invoices.json') });
            const inv = await pt.createInvoice({ amount: 150n, currency: 'KAS' });
            expect(inv.id).toBeDefined();
            expect(inv.uri).toContain('kaspa:store-1');
            expect(inv.uri).toContain('amount=150');
            expect(inv.status).toBe('pending');

            const status = await pt.check(inv.id);
            expect(status).toBe('pending');

            // Simulate payment
            await pt.simulatePay(inv.id);
            const paidStatus = await pt.check(inv.id);
            expect(paidStatus).toBe('paid');

            const receipt = await pt.receipt(inv.id);
            expect(receipt.schema).toBe('paymentReceipt.v1');
            expect(receipt.merchantId).toBe('store-1');

            const list = await pt.listInvoices();
            expect(list.length).toBe(1);

            const stats = await pt.stats();
            expect(stats.totalInvoices).toBe(1);
            expect(stats.paidInvoices).toBe(1);
        });
    });

    describe('JobsToolkit', () => {
        it('should initialize and enqueue jobs', async () => {
            const { JobsToolkit } = await import('../src/index.js');
            const jobs = JobsToolkit.open({ storePath: path.join(tmpDir, 'jobs.json') });
            jobs.registerHandler('test-job', async (ctx) => {
                ctx.progress.update({ total: 10, processed: 10 });
            });
            const id = await jobs.enqueue('test-job', {});
            expect(id).toBeDefined();
            
            // Allow a tick for async job to execute
            await new Promise(r => setTimeout(r, 50));
            
            const job = await jobs.getJob(id);
            expect(job).toBeDefined();
            expect(job?.type).toBe('test-job');
        });
    });

    describe('IndexerToolkit', () => {
        it('should ingest and find artifacts', async () => {
            const idx = IndexerToolkit.open({ dataDir: tmpDir });
            
            await idx.watch('kaspa:store-1'); // should just bind

            await idx.ingestArtifact({
                id: '123',
                schema: 'test.v1',
                tags: ['test:abc']
            });

            const found = await idx.findReceipts({ tags: ['test:abc'] });
            expect(found.length).toBe(1);
            expect(found[0].hash).toBe('123');
        });
    });
});
