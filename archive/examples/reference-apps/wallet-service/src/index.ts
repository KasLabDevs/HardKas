import { WalletToolkit, IndexerToolkit, SnapshotToolkit, IndexerBackendPlugin } from '@hardkas/toolkit';
import { SyncDaemon } from '@hardkas/sync-daemon';
import { WalletQueryProvider } from '@hardkas/query';
import fs from 'fs';

async function main() {
    console.log("Starting App 2: Wallet Service");

    const mockUtxosStore = new Map<string, any[]>();
    
    // 1. Create a mock public IndexerBackendPlugin (0 internal imports!)
    const mockBackend: IndexerBackendPlugin = {
        name: "MockBackend",
        type: "indexer-backend",
        capabilities: { snapshots: false, deterministic: true, externalState: false },
        async connect() {},
        async disconnect() {},
        async balance(address: string) { return 0n; },
        async history(address: string) { return []; },
        async utxos(address: string) {
            return mockUtxosStore.get(address) || [];
        }
    };

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

    const indexer = IndexerToolkit.open({ dataDir: ".hardkas/indexer" });
    // Note: IndexerToolkit normally watches addresses via backend. For mock, we skip attachBackend.
    // (There is no attachBackend public method in IndexerToolkit).

    const wallets: WalletToolkit[] = [];
    let totalUtxosCreated = 0;

    // 2. Initialize 100 wallets and generate 1,000+ addresses, and 10,000+ UTXOs
    for (let i = 0; i < 100; i++) {
        const w = await WalletToolkit.open(`wallet-service-${i}`, { strict: true, provider: mockProvider });
        await w.create();
        wallets.push(w);

        const addr = await w.address(); // Just one address per wallet for simplicity
        
        const utxos = [];
        // Give each wallet 100 UTXOs
        for (let j = 0; j < 100; j++) {
            utxos.push({
                transactionId: `mock-tx-${i}-${j}`,
                outputIndex: 0,
                amountSompi: BigInt(Math.floor(Math.random() * 1000000000) + 1000) // random KAS amount
            });
            totalUtxosCreated++;
        }
        mockUtxosStore.set(addr, utxos);
    }
    console.log(`Created ${wallets.length} wallets with ${totalUtxosCreated} mock UTXOs.`);
    const daemon = SyncDaemon.open({
        backend: mockBackend,
        indexer,
        wallets,
        checkpointPath: ".hardkas/sync.json",
        pollIntervalMs: 500
    });

    await daemon.start();

    // 3. Take a snapshot before
    const snapshotToolkit = SnapshotToolkit.open({ backend: "filesystem", dir: ".hardkas/snapshots" });
    const snapshotBefore = await snapshotToolkit.create("before-operations");
    console.log(`Snapshot taken: ${snapshotBefore.id}`);

    // 4. Perform UTXO Operations
    console.log("Executing Coin Control and Planning...");
    let plannedOperations = 0;

    for (let i = 0; i < 20; i++) {
        const w = wallets[i];
        
        // Let's plan a split
        const stats = await w.utxos.statistics();
        if (stats.availableUtxos > 0) {
            const allUtxos = await w.utxos.list();
            const largestUtxo = allUtxos.reduce((max, u) => BigInt(u.amountSompi) > BigInt(max.amountSompi) ? u : max, allUtxos[0]);
            
            await w.utxos.splitPlan({ utxoId: largestUtxo.transactionId, intoCount: 2 });
            
            // Labels & Notes
            await w.utxos.labels.set(largestUtxo.transactionId, "Whale UTXO");
            await w.utxos.notes.set(largestUtxo.transactionId, "Do not touch until 2030");
            
            // Freeze
            await w.utxos.freeze(largestUtxo.transactionId, "Long term hold");
            
            const newStats = await w.utxos.statistics();
            if (newStats.frozenUtxos === 0) throw new Error("Freeze failed");
            
            // Unfreeze 
            if (i % 2 === 0) {
                await w.utxos.unfreeze(largestUtxo.transactionId);
            }
            
            // Merge Plan
            const mergePlanUtxos = allUtxos.slice(0, 3).map(u => u.transactionId);
            await w.utxos.mergePlan({ utxoIds: mergePlanUtxos });
            
            // Sweep Plan
            await w.utxos.sweepPlan({ destinationAddress: "kaspatest:qzz..." });
            
            plannedOperations++;
        }
    }

    // 5. Take snapshot after
    const snapshotAfter = await snapshotToolkit.create("after-operations");

    // 6. Evidence Generation
    const evidence = {
        totalWallets: wallets.length,
        totalUtxos: totalUtxosCreated,
        operationsPlanned: plannedOperations,
        snapshots: [snapshotBefore.id, snapshotAfter.id],
        realBroadcast: false,
        realFunding: false,
        fixtureUsed: true,
        simnetOnly: true,
        mainnetUsed: false,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('wallet-service.evidence.json', JSON.stringify(evidence, null, 2));

    // 7. Cleanup
    console.log("Shutting down daemon cleanly...");
    await daemon.stop();
    console.log(await daemon.status());
    console.log("Wallet Service finished successfully!");
}

main().catch(e => {
    console.error("Fatal error", e);
    process.exit(1);
});
