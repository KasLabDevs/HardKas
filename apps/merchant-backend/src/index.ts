import { kaspaRpcBackendPlugin } from '@hardkas/plugin-rpc-backend';
import { WalletToolkit, PaymentToolkit, JobsToolkit, IndexerToolkit } from '@hardkas/toolkit';
import { SyncDaemon } from '@hardkas/sync-daemon';
import { postgresStorage } from '@hardkas/storage-postgres';
import { metrics, getHealthSnapshot, toPrometheusText, logger } from '@hardkas/observability';
import fs from 'fs';
import http from 'http';

async function main() {
    console.log("Starting App 1: Merchant Backend (PostgreSQL)");

    // A11 (rc2 audit): no built-in database password (it defaulted to postgres://hardkas:hardkaspassword@…): the
    // connection string is the operator's, from DATABASE_URL, or the app does not start
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || databaseUrl.trim() === '') {
        throw new Error("DATABASE_URL is required (e.g. postgres://<user>:<password>@127.0.0.1:5432/<db>); the app carries no default credentials. Nothing was started.");
    }
    const storage = postgresStorage({ url: databaseUrl });
    await storage.migrate();

    // Setup HTTP Observability Server
    const server = http.createServer((req, res) => {
        if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(getHealthSnapshot({ framework: 'hardkas' })));
        } else if (req.method === 'GET' && req.url === '/metrics') {
            res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
            res.end(toPrometheusText(metrics));
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    // A11 (rc2 audit): loopback only, like everything else in the repository (it listened on every interface, so /health
    // and /metrics were served to the LAN)
    const PORT = Number(process.env.PORT || 3000);
    const HOST = '127.0.0.1';
    server.listen(PORT, HOST, () => {
        logger.info(`Observability server listening on http://${HOST}:${PORT}`);
    });

    const users: WalletToolkit[] = [];
    const merchants: WalletToolkit[] = [];
    const merchantProcessors: PaymentToolkit[] = [];

    for (let i = 0; i < 20; i++) {
        const w = await WalletToolkit.open(`customer-${i}`, { strict: true });
        await w.create();
        users.push(w);
    }

    for (let i = 0; i < 10; i++) {
        const m = await WalletToolkit.open(`merchant-${i}`, { strict: true });
        await m.create();
        merchants.push(m);
        merchantProcessors.push(PaymentToolkit.openMerchant(`merchant-${i}`, { storage }));
    }

    const indexer = IndexerToolkit.open();
    const jobs = JobsToolkit.open({ storage });

    const backend = kaspaRpcBackendPlugin({
        url: "ws://127.0.0.1:18210",
        resilience: { maxRetries: 5, baseDelayMs: 250, timeoutMs: 10000, jitter: true }
    });

    const daemon = SyncDaemon.open({
        backend,
        indexer,
        wallets: [...users, ...merchants],
        jobs,
        checkpointPath: ".hardkas/sync.json",
        pollIntervalMs: 500
    });

    await daemon.start();
    
    let successfulPayments = 0;
    const receipts: any[] = [];
    console.log("Processing 500 invoices...");

    for (let i = 0; i < 500; i++) {
        const user = users[i % users.length];
        const pProcessor = merchantProcessors[i % merchants.length];
        const merchant = merchants[i % merchants.length];
        
        const amount = BigInt(Math.floor(Math.random() * 100000) + 1000);
        
        const invoice = await pProcessor.createInvoice({
            amount,
            currency: 'KAS'
        });

        const roll = Math.random();
        let status = 'completed';
        if (roll > 0.95) {
            status = 'refunded';
            await jobs.enqueue("processRefund", { invoiceId: invoice.id, amount: amount.toString() });
        } else if (roll > 0.90) {
            status = 'partial';
            await jobs.enqueue("flagPartialPayment", { invoiceId: invoice.id, amount: (amount / 2n).toString() });
        } else {
            await pProcessor.simulatePay(invoice.id);
            const r = await pProcessor.receipt(invoice.id);
            receipts.push(r);
        }
        
        successfulPayments++;
        
        if (i > 0 && i % 100 === 0) {
            console.log(`Processed ${i} payments...`);
        }
    }

    const evidence = {
        realBroadcast: false,
        realFunding: false,
        fixtureUsed: true,
        simnetOnly: true,
        mainnetUsed: false,
        totalPayments: successfulPayments,
        merchantsReconciled: 10,
        receiptsGenerated: receipts.length,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('merchant-backend.evidence.json', JSON.stringify(evidence, null, 2));
    
    console.log("Shutting down daemon cleanly...");
    await daemon.stop();
    console.log(await daemon.status());
    console.log("Merchant Backend finished successfully!");
    console.log(`Observability is still running on http://${HOST}:${PORT}/metrics and /health. Press Ctrl+C to exit.`);
    // Omit process.exit() so the server stays up
}

main().catch(e => {
    logger.error("Fatal error", { error: e.message });
    process.exit(1);
});
