import Fastify from 'fastify';
import { OracleStore } from './domain/OracleStore.js';
import { EventPoller } from './domain/EventPoller.js';
import { ReportExporter } from './domain/ReportExporter.js';
import { WalletQuery, WalletQueryProvider } from '@hardkas/query';
import * as path from 'node:path';

export async function buildOracleServer() {
    const fastify = Fastify({ logger: true });

    const store = new OracleStore(path.join(process.cwd(), '.oracle-data', 'state.json'));
    const exportDir = path.join(process.cwd(), '.oracle-data', 'exports');
    const artifactsDir = path.join(process.cwd(), '.oracle-data', 'artifacts');
    const exporter = new ReportExporter(store, exportDir);

    const mockQueryProvider: WalletQueryProvider = {
        source: "mock",
        getBalances: async () => ({}),
        getUtxos: async (addresses: string[]) => {
            const res: Record<string, any[]> = {};
            // Simulate random new utxos occasionally
            if (Math.random() > 0.5) {
                res[addresses[0]] = [{
                    transactionId: Math.random().toString(36).substring(7),
                    outputIndex: 0,
                    amountSompi: 150_000_000_000n, // 1500 KAS
                    scriptPublicKey: "mock_script"
                }];
            }
            return res;
        },
        getHistory: async () => ({ items: [] })
    };

    const queryEngine = new WalletQuery({ provider: mockQueryProvider });
    
    // Some hardcoded mock addresses to watch for the oracle
    const watchedAddresses = [
        "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e",
        "kaspatest:qz7jy9y0s5a4q0qj8n452yymtqqh239r2n465q9p4057eqy5r0c0u29k04s0y"
    ];

    const poller = new EventPoller({
        watchedAddresses,
        queryEngine,
        store,
        artifactsDir
    });

    // Background polling loop simulation (Every 30 seconds ideally, here just endpoint triggered for the Lab)
    // In a real oracle, we'd have a setInterval here. But the EventSubscriber is missing!
    // setInterval(() => poller.poll(), 30000); 

    fastify.get('/health', async () => {
        return { status: 'ok', service: 'hardkas-oracle' };
    });

    fastify.get('/stats', async () => {
        const state = store.load();
        return {
            totalVolumeSompi: state.stats.totalVolumeSompi.toString(),
            eventsProcessed: state.stats.eventsProcessed,
            lastPolledAt: state.stats.lastPolledAt
        };
    });

    fastify.get('/reports', async () => {
        const state = store.load();
        return {
            totalArtifacts: state.artifacts.length,
            artifacts: state.artifacts
        };
    });

    fastify.post('/poll', async () => {
        const eventsFound = await poller.poll();
        return { success: true, newEventsFound: eventsFound };
    });

    fastify.post('/export', async () => {
        const exportedBatchPath = exporter.exportDailySnapshot();
        return { success: true, batchPath: exportedBatchPath };
    });

    return fastify;
}

// Start if executed directly
if (import.meta.url.startsWith('file:') && process.argv[1] === new URL(import.meta.url).pathname) {
    const server = await buildOracleServer();
    try {
        await server.listen({ port: 3004 });
        console.log(`Oracle Server running at http://localhost:3004`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}
