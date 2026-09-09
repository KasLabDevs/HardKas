import { WalletToolkit, IndexerToolkit, JobsToolkit, SnapshotToolkit } from '@hardkas/toolkit';
import { SyncDaemon } from '@hardkas/sync-daemon';
import { WalletQueryProvider } from '@hardkas/query';
import { sqliteStorage } from '@hardkas/storage-sqlite';
import fs from 'fs';

async function main() {
    const phaseArg = process.argv.indexOf('--phase');
    const phase = phaseArg > -1 ? parseInt(process.argv[phaseArg + 1], 10) : 1;
    
    console.log(`Starting App 4: Treasury - Phase ${phase}`);

    // Mock Provider for UTXOs
    const mockUtxosStore = new Map<string, any[]>();
    const mockProvider: WalletQueryProvider = {
        source: "mock",
        async getBalances(addresses) {
            const balances: Record<string, bigint> = {};
            for (const addr of addresses) {
                const utxos = mockUtxosStore.get(addr) || [];
                balances[addr] = utxos.reduce((sum, u) => sum + u.amountSompi, 0n);
            }
            return balances;
        },
        async getUtxos(addresses) {
            const res: Record<string, any[]> = {};
            for (const addr of addresses) {
                res[addr] = mockUtxosStore.get(addr) || [];
            }
            return res;
        },
        async getHistory() { return { items: [] }; }
    };

    // Instantiate 20 Hot Wallets and 80 Cold Wallets
    const hotWallets: WalletToolkit[] = [];
    const coldWallets: WalletToolkit[] = [];

    let totalUtxos = 0;
    for (let i = 0; i < 100; i++) {
        const isHot = i < 20;
        const w = await WalletToolkit.open(`treasury-${isHot ? 'hot' : 'cold'}-${i}`, { 
            strict: true, 
            provider: mockProvider,
            storePath: `.hardkas/wallets/treasury-${i}.json` 
        });
        await w.create();
        
        if (isHot) hotWallets.push(w);
        else coldWallets.push(w);

        const addr = await w.address();
        if (phase === 1) {
            const utxos = [];
            // Seed each hot wallet with 100 UTXOs
            if (isHot) {
                for (let j = 0; j < 100; j++) {
                    utxos.push({
                        transactionId: `mock-tx-${i}-${j}`,
                        outputIndex: 0,
                        amountSompi: BigInt(1000000000) // 10 KAS
                    });
                    totalUtxos++;
                }
            }
            mockUtxosStore.set(addr, utxos);
        }
    }

    const indexer = IndexerToolkit.open({ dataDir: ".hardkas/indexer" });
    const storage = sqliteStorage({ path: '.hardkas/app.db' });
    await storage.migrate();
    const jobs = JobsToolkit.open({ storage });

    // Handle Reconciliation and Batching jobs
    let paymentsProcessed = 0;
    jobs.registerHandler("reconciliation", async (ctx, args) => {
        let { startIdx = 0 } = ctx.checkpoint.load() || {};
        
        for (let i = startIdx; i < 50; i++) {
            await new Promise(r => setTimeout(r, 50)); // Simulating work
            
            ctx.progress.update({ processed: i + 1, total: 50 });
            ctx.checkpoint.save({ startIdx: i + 1 });
            paymentsProcessed++;

            if (phase === 1 && i === 25) {
                console.log("💥 SIMULATING POWER CUT (process.exit 137)");
                process.exit(137);
            }
        }
        console.log("Reconciliation complete.");
    });

    const daemon = SyncDaemon.open({
        backend: {
            name: "MockBackend",
            type: "indexer-backend",
            capabilities: { snapshots: false, deterministic: true, externalState: false },
            async connect() {}, async disconnect() {},
            async balance() { return 0n; }, async history() { return []; },
            async utxos(addr: string) { return mockUtxosStore.get(addr) || []; }
        },
        indexer,
        wallets: [...hotWallets, ...coldWallets],
        jobs,
        checkpointPath: ".hardkas/sync.json",
        pollIntervalMs: 500
    });

    if (phase === 1) {
        console.log("Starting Daemon and Jobs (Phase 1)");
        await daemon.start();
        
        // Take a snapshot
        const snapshotToolkit = SnapshotToolkit.open({ backend: "filesystem", dir: ".hardkas/snapshots" });
        await snapshotToolkit.create("treasury-checkpoint-1");

        // Enqueue Job that will crash
        console.log("Enqueueing reconciliation job...");
        await jobs.enqueue("reconciliation", { runDate: "2026-06-29" });
        
        // Wait indefinitely since the job will exit the process
        await new Promise(() => {}); 
    }

    if (phase === 2) {
        console.log("Resuming Daemon and Jobs (Phase 2)");
        
        // Reload Jobs (Rehydration)
        await jobs.resumePendingJobs(); // <--- Framework Friction resolved here!

        await daemon.start();

        // Wait a bit for job to finish
        console.log("Waiting for job to finish...");
        await new Promise(r => setTimeout(r, 3000));
        
        console.log(`Payments Processed in Phase 2: ${paymentsProcessed}`);
        
        // Check job state
        const state = await jobs.snapshot();
        const allJobs = Object.values(state as Record<string, any>);
        const failedJob = allJobs.find(j => j.status === 'failed');
        if (failedJob) throw new Error("Job failed to resume or finished with error");
        
        const completedJob = allJobs.find(j => j.status === 'completed');
        if (!completedJob) throw new Error("Job did not complete");

        // Write Evidence
        const evidence = {
            phase2Recovery: true,
            jobResumed: true,
            jobCompleted: true,
            hotWallets: hotWallets.length,
            coldWallets: coldWallets.length,
            totalUtxos,
            timestamp: new Date().toISOString()
        };
        fs.writeFileSync('treasury.evidence.json', JSON.stringify(evidence, null, 2));

        console.log("Shutting down cleanly...");
        await daemon.stop();
        console.log("Phase 2 finished successfully!");
    }
}

main().catch(e => {
    console.error("Fatal error", e);
    process.exit(1);
});
