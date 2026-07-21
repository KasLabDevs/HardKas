import { IndexerToolkit, SnapshotToolkit, JobsToolkit } from '@hardkas/toolkit';
import { SyncDaemon } from '@hardkas/sync-daemon';
import { kaspaRpcBackendPlugin } from '@hardkas/plugin-rpc-backend';
import { sqliteStorage } from '@hardkas/storage-sqlite';
import http from 'http';
import fs from 'fs';

async function main() {
    console.log("Starting App 3: Explorer Backend");

    const indexer = IndexerToolkit.open({ dataDir: ".hardkas/indexer" });
    const storage = sqliteStorage({ path: '.hardkas/app.db' });
    await storage.migrate();
    const jobs = JobsToolkit.open({ storage });

    // Provide a mocked KaspaRpcBackendPlugin because we need to satisfy SyncDaemon
    const backend = kaspaRpcBackendPlugin({
        url: "ws://127.0.0.1:18210",
        resilience: { maxRetries: 5, baseDelayMs: 250, timeoutMs: 10000, jitter: true }
    });

    const daemon = SyncDaemon.open({
        backend,
        indexer,
        wallets: [],
        jobs,
        checkpointPath: ".hardkas/sync.json",
        pollIntervalMs: 500
    });

    const snapshotToolkit = SnapshotToolkit.open({ backend: "filesystem", dir: ".hardkas/snapshots" });
    
    console.log("Connecting daemon...");
    // Start daemon to get it polling
    await daemon.start();

    // 1. Take a snapshot before ingest
    const snapshotBefore = await snapshotToolkit.create("explorer-before");

    // 2. Ingest blocks manually via Jobs Toolkit (simulating real DAG building)
    console.log("Ingesting mock blocks into DAG...");
    const mockBlocks = [];
    for (let i = 0; i < 50; i++) {
        mockBlocks.push({
            hash: `block-${i}`,
            parents: i > 0 ? [`block-${i - 1}`] : [],
            children: [],
            blueScore: i,
            isChainBlock: true,
            timestamp: Date.now()
        });
    }
    await indexer.dag.ingestBlocks(mockBlocks);

    // Take snapshot after
    const snapshotAfter = await snapshotToolkit.create("explorer-after");

    // 3. Setup REST API using node's native http module
    const server = http.createServer(async (req, res) => {
        try {
            res.setHeader('Content-Type', 'application/json');
            
            if (req.url === '/health') {
                return res.end(JSON.stringify({ status: 'ok', daemon: await daemon.status() }));
            }
            if (req.url === '/dag/statistics') {
                return res.end(JSON.stringify(await indexer.dag.statistics()));
            }
            if (req.url === '/blocks') {
                const stats = await indexer.dag.statistics();
                return res.end(JSON.stringify({ totalBlocks: stats.totalBlocks }));
            }
            if (req.url?.startsWith('/blocks/')) {
                const parts = req.url.split('/');
                const hash = parts[2];
                const sub = parts[3];
                if (!sub) return res.end(JSON.stringify(await indexer.dag.block(hash).catch(e => ({ error: "Not found" }))));
                if (sub === 'parents') return res.end(JSON.stringify(await indexer.dag.parents(hash).catch(e => [])));
                if (sub === 'children') return res.end(JSON.stringify(await indexer.dag.children(hash).catch(e => [])));
                if (sub === 'neighborhood') return res.end(JSON.stringify(await indexer.dag.neighborhood(hash).catch(e => null)));
            }
            if (req.url?.startsWith('/addresses/') && req.url.endsWith('/balance')) {
                const addr = req.url.split('/')[2];
                return res.end(JSON.stringify({ address: addr, balance: Number(await indexer.balance(addr)) }));
            }
            
            res.statusCode = 404;
            return res.end(JSON.stringify({ error: "Not found" }));
        } catch (e: any) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: e.message }));
        }
    });

    server.listen(18888, () => {
        console.log("Explorer REST API listening on port 18888");
    });

    // 4. Simulate 10 logical clients querying in parallel
    console.log("Simulating 10 concurrent clients querying REST API...");
    const clients = [];
    
    for (let c = 0; c < 10; c++) {
        clients.push((async () => {
            const fetchApi = (path: string) => new Promise((resolve, reject) => {
                http.get(`http://127.0.0.1:18888${path}`, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(JSON.parse(data)));
                }).on('error', reject);
            });

            await fetchApi('/health');
            await fetchApi('/dag/statistics');
            await fetchApi('/blocks');
            await fetchApi('/blocks/block-10');
            await fetchApi('/blocks/block-10/parents');
            await fetchApi('/blocks/block-10/children');
            await fetchApi('/blocks/block-10/neighborhood');
            await fetchApi('/addresses/kaspatest:123/balance');
        })());
    }

    await Promise.all(clients);
    console.log("All clients successfully finished queries.");

    // 5. Evidence
    const evidence = {
        clientsSimulated: 10,
        snapshots: [snapshotBefore.id, snapshotAfter.id],
        realBroadcast: false,
        realFunding: false,
        fixtureUsed: true,
        simnetOnly: true,
        mainnetUsed: false,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('explorer-backend.evidence.json', JSON.stringify(evidence, null, 2));

    // 6. Cleanup
    console.log("Shutting down daemon and server cleanly...");
    await daemon.stop();
    server.close();
    console.log("Explorer Backend finished successfully!");
}

main().catch(e => {
    console.error("Fatal error", e);
    process.exit(1);
});
