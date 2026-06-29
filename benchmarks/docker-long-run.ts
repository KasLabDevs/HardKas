import { IndexerToolkit, JobsToolkit, SnapshotToolkit } from '../packages/toolkit/src/index.js';
import { kaspaRpcBackendPlugin } from '../packages/plugin-rpc-backend/src/index.js';
import * as os from 'node:os';

async function main() {
    const args = process.argv.slice(2);
    const minuteIdx = args.indexOf('--minutes');
    const minutes = minuteIdx >= 0 ? parseInt(args[minuteIdx + 1], 10) : 30;

    console.log(`Starting long-run stress test for ${minutes} minutes...`);

    const rpcPlugin = kaspaRpcBackendPlugin({
        url: 'ws://127.0.0.1:18210' // Assuming standard simnet/docker rust kaspad
    });

    const indexer = await IndexerToolkit.open({
        backend: rpcPlugin
    });

    const jobs = await JobsToolkit.open({ storePath: ':memory:' });
    const snapshots = await SnapshotToolkit.open({ storePath: ':memory:' });

    await indexer.connect().catch(e => {
        console.warn("Could not connect to real RPC, test may fail or degrade:", e.message);
    });

    const endTime = Date.now() + minutes * 60 * 1000;
    
    let iterations = 0;
    
    jobs.registerHandler('stress-job', async () => {
        await new Promise(r => setTimeout(r, 10)); // simulated work
    });

    const interval = setInterval(async () => {
        try {
            // Simulate steady RPC load
            await indexer.balance('kaspa:qtest123');
            await indexer.history('kaspa:qtest123');
            
            // Queue and process jobs
            await jobs.enqueue('stress-job', { iter: iterations });
            
            // Periodically snapshot
            if (iterations % 100 === 0) {
                await snapshots.create(`snap-${iterations}`);
            }

            iterations++;
        } catch (e: any) {
            console.error(`Iteration error:`, e.message);
        }
    }, 1000);

    return new Promise<void>((resolve, reject) => {
        const check = setInterval(() => {
            if (Date.now() >= endTime) {
                clearInterval(check);
                clearInterval(interval);
                console.log(`Stress test completed. Total iterations: ${iterations}`);
                const mem = process.memoryUsage();
                console.log(`Final memory: RSS=${Math.round(mem.rss/1024/1024)}MB, Heap=${Math.round(mem.heapUsed/1024/1024)}MB`);
                resolve();
            }
        }, 1000);
    });
}

main().catch(console.error);
