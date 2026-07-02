import fastify from 'fastify';
import cors from '@fastify/cors';
import { kaspaRpcBackendPlugin } from '@hardkas/plugin-rpc-backend';
import { WalletToolkit, JobsToolkit, IndexerToolkit, PaymentToolkit, SnapshotToolkit } from '@hardkas/toolkit';
import { SyncDaemon } from '@hardkas/sync-daemon';
import { sqliteStorage } from '@hardkas/storage-sqlite';
import { metrics, getHealthSnapshot, toPrometheusText, logger } from '@hardkas/observability';

export const server = fastify({ logger: false });
server.register(cors, { origin: '*' });

export let daemon: SyncDaemon;
export let wallet: WalletToolkit;
export let indexer: IndexerToolkit;
export let jobs: JobsToolkit;
export let payments: PaymentToolkit;
export let snapshots: SnapshotToolkit;

// Initialize HardKAS ecosystem
export async function initHardKAS() {
    logger.info("Initializing HardKAS SuperApp Backend");

    const storage = sqliteStorage({ path: '.hardkas/superapp.db' });
    await storage.migrate();

    wallet = await WalletToolkit.open("treasury", { network: "simnet" });
    await wallet.create();

    indexer = IndexerToolkit.open();
    jobs = JobsToolkit.open({ storage });
    payments = PaymentToolkit.openMerchant("superapp-merchant", { storage });
    snapshots = SnapshotToolkit.open();

    const backend = kaspaRpcBackendPlugin({
        url: process.env.KASPAD_URL || "ws://127.0.0.1:16210",
        resilience: { maxRetries: 5, baseDelayMs: 250, timeoutMs: 10000, jitter: true }
    });

    daemon = SyncDaemon.open({
        backend,
        indexer,
        wallets: [wallet],
        jobs,
        checkpointPath: ".hardkas/sync.json",
        pollIntervalMs: 2000
    });

    await daemon.start();
    logger.info("HardKAS SuperApp Backend Initialized", { address: await wallet.address() });
}

// Routes
server.get('/health', async (request, reply) => {
    return getHealthSnapshot({ framework: 'hardkas-superapp' });
});

server.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return toPrometheusText(metrics);
});

server.get('/api/wallet/address', async (request, reply) => {
    return { address: await wallet.address() };
});

server.get('/api/wallet/balance', async (request, reply) => {
    const balance = await wallet.balance();
    return { balance: balance.toString() };
});

server.post('/api/wallet/send', async (request, reply) => {
    try {
        const addr = await wallet.address();
        const tx = await wallet.sendSimulated({ to: addr, amount: 100n });
        return { status: 'success', txid: tx };
    } catch (e: any) {
        return { status: 'error', error: e.message };
    }
});

server.post('/api/jobs/trigger', async (request, reply) => {
    // dummy job
    return { status: 'job_enqueued' };
});

server.get('/api/dag/info', async (request, reply) => {
    return { status: 'ok', blockCount: 100 };
});

server.get('/api/silver/claims', async (request, reply) => {
    return { claims: [] };
});

export const start = async () => {
    try {
        await initHardKAS();
        await server.listen({ port: 3000, host: '0.0.0.0' });
        logger.info(`SuperApp Backend listening at http://localhost:3000`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

if (import.meta.url.startsWith('file:') && process.argv[1] === new URL(import.meta.url).pathname) {
    start();
}
