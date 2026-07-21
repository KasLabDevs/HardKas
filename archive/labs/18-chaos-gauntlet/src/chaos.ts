import { FaultProxy } from './proxy.js';
import { kaspaRpcBackendPlugin } from '@hardkas/plugin-rpc-backend';
import { IndexerToolkit, WalletToolkit, SnapshotToolkit, JobsToolkit } from '@hardkas/toolkit';
import { parseArgs } from 'util';
import fs from 'fs';

const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
        minutes: { type: 'string', default: '1' },
        seed: { type: 'string', default: '123' }
    }
});

const MINUTES = parseInt(values.minutes as string);
const SEED = parseInt(values.seed as string);

const metrics = {
    requestsStarted: 0,
    requestsSucceeded: 0,
    requestsFailedStructured: 0,
    unhandledRejections: 0,
    reconnects: 0,
    retries: 0,
    timeouts: 0,
    corruptFramesInjected: 0,
    droppedFramesInjected: 0,
    peakHeapMb: 0,
    durationMs: 0,
    seed: SEED
};

// Global error handlers
process.on('unhandledRejection', (reason) => {
    metrics.unhandledRejections++;
    console.error('CRITICAL: unhandledRejection', reason);
});
process.on('uncaughtException', (err) => {
    console.error('CRITICAL: uncaughtException', err);
    process.exit(1);
});

async function runScenarioRugPull(proxy: FaultProxy, plugin: any) {
    console.log("--- SCENARIO 1: Rug Pull ---");
    proxy.config.killConnections = false;
    const promises = [];
    for (let i = 0; i < 50; i++) {
        promises.push((async () => {
            metrics.requestsStarted++;
            try {
                await plugin.balance(`kaspatest:rugpull${i}`);
                metrics.requestsSucceeded++;
            } catch (e: any) {
                if (e.name === 'HardkasRpcConnectionError' || e.name === 'HardkasRpcTimeoutError' || e.name === 'HardkasRpcSemanticError') {
                    metrics.requestsFailedStructured++;
                }
            }
        })());
    }

    // Mid-execution kill
    setTimeout(() => {
        proxy.killAll();
    }, 50);

    await Promise.all(promises);
}

async function runScenarioDrunkNode(proxy: FaultProxy, plugin: any) {
    console.log("--- SCENARIO 2: Drunk Node ---");
    proxy.config.killConnections = false;
    proxy.config.corruptProbability = 0.2;
    proxy.config.dropProbability = 0.2;
    proxy.config.slowlorisDelayMs = 0;

    const promises = [];
    for (let i = 0; i < 50; i++) {
        promises.push((async () => {
            metrics.requestsStarted++;
            try {
                await plugin.balance(`kaspatest:drunk${i}`);
                metrics.requestsSucceeded++;
            } catch (e: any) {
                if (e.name === 'HardkasRpcConnectionError' || e.name === 'HardkasRpcTimeoutError' || e.name === 'HardkasRpcSemanticError') {
                    metrics.requestsFailedStructured++;
                }
            }
        })());
    }

    await Promise.all(promises);
    proxy.config.corruptProbability = 0;
    proxy.config.dropProbability = 0;
}

async function runScenarioSchrodinger(proxy: FaultProxy, plugin: any) {
    console.log("--- SCENARIO 3: Schrödinger's State ---");
    proxy.config.killConnections = false;
    const jobs = JobsToolkit.open({ storePath: ".hardkas/chaos-jobs.json" });
    const snapshotTool = SnapshotToolkit.open({ backend: "memory" });
    snapshotTool.register("jobs", jobs);

    for (let i = 0; i < 20; i++) {
        await jobs.enqueue("test-job", { i });
    }

    const promises = [];
    for (let i = 0; i < 10; i++) {
        promises.push(jobs.enqueue("test-job-parallel", { i }));
    }

    const snap = await snapshotTool.create("mid-chaos");

    // Fail remaining jobs manually by enqueueing invalid ones
    await jobs.enqueue("crash", {});

    await snapshotTool.restore(snap.snapshotId);
}

async function runScenarioThunderingHerd(proxy: FaultProxy, plugin: any) {
    console.log("--- SCENARIO 4: Thundering Herd ---");
    proxy.killAll();
    proxy.config.killConnections = true;
    
    const promises = [];
    for (let i = 0; i < 100; i++) {
        promises.push((async () => {
            metrics.requestsStarted++;
            try {
                await plugin.balance(`kaspatest:herd${i}`);
                metrics.requestsSucceeded++;
            } catch (e: any) {
                if (e.name === 'HardkasRpcConnectionError' || e.name === 'HardkasRpcTimeoutError' || e.name === 'HardkasRpcSemanticError') {
                    metrics.requestsFailedStructured++;
                }
            }
        })());
    }

    setTimeout(() => {
        proxy.config.killConnections = false;
    }, 2000); // 2 seconds disconnected

    await Promise.all(promises);
}

async function runScenarioSlowloris(proxy: FaultProxy, plugin: any) {
    console.log("--- SCENARIO 5: Slowloris ---");
    proxy.config.killConnections = false;
    proxy.config.slowlorisDelayMs = 2000; // 2 seconds per response

    const promises = [];
    for (let i = 0; i < 10; i++) {
        promises.push((async () => {
            metrics.requestsStarted++;
            try {
                await plugin.balance(`kaspatest:slow${i}`);
                metrics.requestsSucceeded++;
            } catch (e: any) {
                if (e.name === 'HardkasRpcConnectionError' || e.name === 'HardkasRpcTimeoutError' || e.name === 'HardkasRpcSemanticError') {
                    metrics.requestsFailedStructured++;
                }
            }
        })());
    }

    await Promise.all(promises);
    proxy.config.slowlorisDelayMs = 0;
}

async function main() {
    console.log(`Starting P57.5 Chaos Gauntlet. Seed: ${SEED}, Minutes: ${MINUTES}`);
    const startTime = Date.now();
    const endTime = startTime + MINUTES * 60 * 1000;

    const proxy = new FaultProxy({ targetUrl: 'mock', listenPort: 18210, seed: SEED });
    await proxy.start();

    const plugin = kaspaRpcBackendPlugin({
        url: "ws://127.0.0.1:18210",
        resilience: {
            maxRetries: 3,
            baseDelayMs: 100,
            maxDelayMs: 1000,
            timeoutMs: 500, // Short timeout for tests
            jitter: true
        }
    });

    await plugin.connect();

    while (Date.now() < endTime) {
        await runScenarioRugPull(proxy, plugin);
        await runScenarioDrunkNode(proxy, plugin);
        await runScenarioSchrodinger(proxy, plugin);
        await runScenarioThunderingHerd(proxy, plugin);
        await runScenarioSlowloris(proxy, plugin);
        
        // Let event loop breathe
        await new Promise(r => setTimeout(r, 100));

        const mem = process.memoryUsage().heapUsed / 1024 / 1024;
        if (mem > metrics.peakHeapMb) metrics.peakHeapMb = Math.round(mem);
    }

    // Gather metrics
    const stats = plugin.stats ? plugin.stats() : { retries: 0, reconnects: 0, timeouts: 0 };
    metrics.retries = stats.retries;
    metrics.reconnects = stats.reconnects;
    metrics.timeouts = stats.timeouts;
    metrics.corruptFramesInjected = proxy.metrics.corruptFramesInjected;
    metrics.droppedFramesInjected = proxy.metrics.droppedFramesInjected;
    metrics.durationMs = Date.now() - startTime;

    await plugin.disconnect?.();
    await proxy.stop();

    fs.writeFileSync('CHAOS_SURVIVAL_REPORT.json', JSON.stringify(metrics, null, 2));

    console.log('--- CHAOS SURVIVAL REPORT ---');
    console.log(JSON.stringify(metrics, null, 2));

    if (metrics.unhandledRejections > 0) {
        console.error("FAILED: Unhandled rejections detected.");
        process.exit(1);
    }

    console.log("SUCCESS: Runtime survived the Chaos Gauntlet cleanly.");
    process.exit(0);
}

main().catch(e => {
    console.error("Fatal error:", e);
    process.exit(1);
});
