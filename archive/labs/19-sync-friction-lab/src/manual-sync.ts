import { kaspaRpcBackendPlugin } from '@hardkas/plugin-rpc-backend';
import { WalletToolkit, IndexerToolkit, JobsToolkit } from '@hardkas/toolkit';
import { SyncDaemon } from '@hardkas/sync-daemon';

async function main() {
    console.log("Starting Lab 19: Sync Daemon Friction Resolved");

    const wallets: WalletToolkit[] = [];

    for (let i = 0; i < 10; i++) {
        const w = await WalletToolkit.open(`user-${i}`, { strict: true });
        await w.create();
        wallets.push(w);
    }
    for (let i = 0; i < 3; i++) {
        const m = await WalletToolkit.open(`merchant-${i}`, { strict: true });
        await m.create();
        wallets.push(m);
    }

    const indexer = IndexerToolkit.open({ dataDir: ".hardkas/indexer" });
    const jobs = JobsToolkit.open({ storePath: ".hardkas/jobs.json" });

    const backend = kaspaRpcBackendPlugin({
        url: "ws://127.0.0.1:18210",
        resilience: { maxRetries: 5, baseDelayMs: 250, timeoutMs: 10000, jitter: true }
    });

    const daemon = SyncDaemon.open({
        backend,
        indexer,
        wallets,
        jobs,
        checkpointPath: ".hardkas/sync.json",
        pollIntervalMs: 1000
    });

    const shutdown = async () => {
        console.log("Shutting down cleanly via Daemon...");
        await daemon.stop();
        console.log(await daemon.status());
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    console.log("Starting daemon...");
    await daemon.start();

    // Run for 5 seconds to simulate uptime
    setTimeout(() => {
        shutdown();
    }, 5000);
}

main().catch(e => {
    console.error("Fatal error", e);
    process.exit(1);
});
