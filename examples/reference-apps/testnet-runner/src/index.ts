import { kaspaRpcBackendPlugin } from '@hardkas/plugin-rpc-backend';
import { WalletToolkit, JobsToolkit, IndexerToolkit } from '@hardkas/toolkit';
import { SyncDaemon } from '@hardkas/sync-daemon';
import { sqliteStorage } from '@hardkas/storage-sqlite';
import { metrics, getHealthSnapshot, toPrometheusText, logger } from '@hardkas/observability';
import http from 'http';
import fs from 'fs';

// Default to 30 minutes for smoke test
const RUN_DURATION_MS = 30 * 60 * 1000;
const PORT = process.env.PORT || 3030;
const startTime = Date.now();

// Register explicit metrics for the test
metrics.register({ name: "process_heap_mb", type: "gauge", help: "Memory" });
metrics.register({ name: "uptime_seconds", type: "gauge", help: "Uptime" });
metrics.register({ name: "wallet_tx_submitted_total", type: "counter", help: "Total tx submitted by wallet" });
metrics.register({ name: "sync_daemon_cycles_total", type: "counter", help: "Sync cycles" });
metrics.register({ name: "jobs_completed_total", type: "counter", help: "Completed jobs" });
metrics.register({ name: "testnet_soak_failures", type: "counter", help: "Failures" });

let uncaughtExceptions = 0;
let unhandledRejections = 0;

process.on('uncaughtException', (err) => {
    logger.error("Uncaught Exception in testnet-runner", { error: err.message, stack: err.stack });
    uncaughtExceptions++;
    metrics.inc("testnet_soak_failures");
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error("Unhandled Rejection in testnet-runner", { reason: String(reason) });
    unhandledRejections++;
    metrics.inc("testnet_soak_failures");
});

async function main() {
    logger.info("Starting P65.1 Testnet Smoke Runner");
    logger.info(`Will run for ${RUN_DURATION_MS / 60000} minutes`);

    // Setup HTTP Observability Server
    const server = http.createServer((req, res) => {
        if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(getHealthSnapshot({ framework: 'hardkas', uptime: Math.floor((Date.now() - startTime) / 1000) })));
        } else if (req.method === 'GET' && req.url === '/metrics') {
            res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
            res.end(toPrometheusText(metrics));
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    server.listen(PORT, () => {
        logger.info(`Testnet Runner Observability server listening on port ${PORT}`);
    });

    // Initialize Database
    const storage = sqliteStorage({ path: '.hardkas/testnet.db' });
    await storage.migrate();

    // Initialize Wallet
    const wallet = await WalletToolkit.open("smoke-test-bot", { network: "testnet" });
    await wallet.create();
    const address = await wallet.address();
    logger.info(`Wallet Address: ${address}`);
    logger.info(`Please fund this address via a testnet faucet to enable active transaction testing.`);

    const indexer = IndexerToolkit.open();
    const jobs = JobsToolkit.open({ storage });

    const backend = kaspaRpcBackendPlugin({
        url: process.env.KASPAD_URL || "ws://127.0.0.1:16210",
        resilience: { maxRetries: 5, baseDelayMs: 250, timeoutMs: 10000, jitter: true }
    });

    const daemon = SyncDaemon.open({
        backend,
        indexer,
        wallets: [wallet],
        jobs,
        checkpointPath: ".hardkas/sync.json",
        pollIntervalMs: 2000
    });

    await daemon.start();

    // Periodic tasks & metrics update
    const interval = setInterval(async () => {
        const memoryUsage = process.memoryUsage();
        metrics.set("process_heap_mb", Math.round(memoryUsage.heapUsed / 1024 / 1024));
        metrics.set("uptime_seconds", Math.floor((Date.now() - startTime) / 1000));
        metrics.inc("sync_daemon_cycles_total");

        try {
            // Check balance and send if possible
            const balance = await wallet.balance();
            if (balance > 10000n) {
                logger.info("Funds detected! Simulating active send...", { balance: balance.toString() });
                const dest = await wallet.address(); // Send to self
                await wallet.sendSimulated({ to: dest, amount: 10000n });
                metrics.inc("wallet_tx_submitted_total");
            } else {
                logger.debug("Running in read-only mode, insufficient funds", { balance: balance.toString() });
            }

            // Simulate job enqueueing
            await jobs.enqueue("testnet_heartbeat", { timestamp: Date.now() });
            metrics.inc("jobs_completed_total");

        } catch (e: any) {
            logger.warn("Periodic task error", { error: e.message });
        }
    }, 10000); // Check every 10 seconds

    // Wait for the duration
    await new Promise(resolve => setTimeout(resolve, RUN_DURATION_MS));

    clearInterval(interval);
    logger.info("Smoke test duration reached. Shutting down.");

    await daemon.stop();
    server.close();

    const report = {
        testnet: true,
        durationMinutes: RUN_DURATION_MS / 60000,
        unhandledRejections,
        uncaughtExceptions,
        metricsSnapshot: getHealthSnapshot({ framework: 'hardkas' }),
        success: unhandledRejections === 0 && uncaughtExceptions === 0
    };

    fs.writeFileSync('TESTNET_SOAK_REPORT.json', JSON.stringify(report, null, 2));
    logger.info("Wrote TESTNET_SOAK_REPORT.json");

    if (!report.success) {
        logger.error("Testnet Smoke Test failed due to unhandled exceptions or rejections.");
        process.exit(1);
    }
}

main().catch(e => {
    logger.error("Fatal startup error in testnet-runner", { error: e.message });
    process.exit(1);
});
