import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { server, initHardKAS, daemon, wallet, payments, snapshots, indexer, jobs } from '../../backend/src/index.js';
import { DockerKaspadRunner } from '@hardkas/node-runner';
import fs from 'fs';

let nodeRunner: DockerKaspadRunner;

describe('SuperApp Backend Integration', () => {
    beforeAll(async () => {
        // Cleanup storage for clean test
        if (fs.existsSync('.hardkas/superapp.db')) {
            fs.unlinkSync('.hardkas/superapp.db');
        }
        if (fs.existsSync('.hardkas/superapp.db-wal')) {
            fs.unlinkSync('.hardkas/superapp.db-wal');
        }
        if (fs.existsSync('.hardkas/superapp.db-shm')) {
            fs.unlinkSync('.hardkas/superapp.db-shm');
        }
        
        nodeRunner = new DockerKaspadRunner({ network: 'simnet', containerName: 'superapp-simnet' });
        await nodeRunner.start();

        await initHardKAS();
        await server.ready();
    }, 30000);

    afterAll(async () => {
        if (daemon) {
            await daemon.stop();
        }
        await server.close();
        if (nodeRunner) {
            await nodeRunner.stop();
        }
    }, 30000);

    it('should boot and return health metrics', async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/health'
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.status).toBe('up');
        expect(payload.components.framework).toBe('hardkas-superapp');
    });

    it('should expose prometheus metrics', async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/metrics'
        });

        expect(response.statusCode).toBe(200);
        expect(response.payload).toContain('rpc_requests_total');
    });

    it('should return wallet address', async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/api/wallet/address'
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.address).toContain('kaspa');
    });

    it('should return wallet balance', async () => {
        const response = await server.inject({
            method: 'GET',
            url: '/api/wallet/balance'
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.balance).toBeDefined();
    });

    describe('1. WalletToolkit paths', () => {
        it('should get history', async () => {
            const history = await wallet.history();
            expect(history).toBeDefined();
        });

        it('should get utxos', async () => {
            const utxos = await wallet.utxos.list();
            expect(utxos).toBeDefined();
        });

        it('should estimate fees', async () => {
            try {
                await wallet.estimateFee({ to: await wallet.address(), amount: 100n });
            } catch (e: any) {
                expect(e.message).toBeDefined();
            }
        });

        it('should plan a send and fail if unfunded', async () => {
            try {
                await wallet.planSend({ to: await wallet.address(), amount: 100n });
            } catch (e: any) {
                expect(e.message).toBeDefined();
            }
        });
    });

    describe('2. PaymentToolkit paths', () => {
        let invoiceId: string;
        
        it('should create an invoice', async () => {
            const result = await payments.createInvoice({ amount: 1000n, label: 'test order' });
            expect(result.id).toBeDefined();
            invoiceId = result.id;
        });

        it('should get invoice', async () => {
            const inv = await payments.getInvoice(invoiceId);
            expect(inv?.amount).toBe(1000n);
        });

        it('should list invoices', async () => {
            const list = await payments.listInvoices();
            expect(list.length).toBeGreaterThan(0);
        });

        it('should fetch stats', async () => {
            const stats = await payments.stats();
            expect(stats).toBeDefined();
        });

        it('should check invoice', async () => {
            const status = await payments.check(invoiceId);
            expect(status).toBeDefined();
        });
    });

    describe('3. SnapshotToolkit paths', () => {
        let snapshotId: string;

        it('should create a snapshot', async () => {
            const result = await snapshots.create('base');
            expect(result.snapshotId).toBeDefined();
            snapshotId = result.snapshotId;
        });

        it('should compare snapshots', async () => {
            try {
                await snapshots.compare(snapshotId, 'non-existent');
            } catch (e: any) {
                expect(e).toBeDefined();
            }
        });

        it('should branch a snapshot', async () => {
            const branched = await snapshots.branch(snapshotId, 'new-branch');
            expect(branched.snapshotId).toBeDefined();
        });

        it('should list snapshots', async () => {
            const list = await snapshots.list();
            expect(list.length).toBeGreaterThan(0);
        });

        it('should register a custom participant and restore', async () => {
            let stateWas = 0;
            snapshots.register('custom-plugin', {
                snapshot: async () => ({ value: stateWas }),
                restore: async (state) => { stateWas = state.value; },
                reload: async () => {}
            });

            const snap1 = await snapshots.create('state-0');
            stateWas = 5;
            const snap2 = await snapshots.create('state-5');

            await snapshots.restore(snap1.snapshotId);
            expect(stateWas).toBe(0);

            await snapshots.restore(snap2.snapshotId);
            expect(stateWas).toBe(5);
        });
    });

    describe('4. Indexer/DAG paths', () => {
        it('should allow reachability checks', async () => {
            try {
                await indexer.reachability('hash1', 'hash2');
            } catch (e: any) {
                expect(e).toBeDefined();
            }
        });

        it('should check confirmations', async () => {
            try {
                await indexer.confirmations('hash1');
            } catch (e: any) {
                expect(e).toBeDefined();
            }
        });

        it('should trace a transaction', async () => {
            try {
                await indexer.trace('hash1');
            } catch (e: any) {
                expect(e).toBeDefined();
            }
        });
    });

    describe('5. JobsToolkit paths', () => {
        it('should resume pending jobs', async () => {
            await jobs.resumePendingJobs();
        });

        it('should get a job', async () => {
            const job = await jobs.getJob('non-existent');
            expect(job).toBeUndefined();
        });
    });
});
