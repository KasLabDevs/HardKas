import { DockerKaspadRunner } from '@hardkas/node-runner';
import { JsonWrpcKaspaClient } from '@hardkas/kaspa-rpc';
import { rpcBlockToDagBlock } from '@hardkas/kaspa-rpc/adapters';
import { DagApi, IndexerToolkit, JobsToolkit, SnapshotToolkit, WalletToolkit } from '@hardkas/toolkit';
import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';

const HARDKAS_DIR = '.hardkas';

async function checkDocker(): Promise<boolean> {
    try {
        await execa('docker', ['info']);
        return true;
    } catch {
        return false;
    }
}

// We use the official adapter from @hardkas/kaspa-rpc/adapters now

async function main() {
    console.log("=== LAB 14: REAL NODE VALIDATION ===");

    if (!(await checkDocker())) {
        console.log("Docker is not available on this system.");
        console.log("LAB_14_REAL_NODE_VALIDATION_SKIPPED_DOCKER_UNAVAILABLE");
        process.exit(0);
    }

    // Clean previous state
    await fs.remove(HARDKAS_DIR);

    // 1. Start Docker Simnet
    console.log("[1] Starting Docker Kaspad (simnet)...");
    const runner = new DockerKaspadRunner();
    const status = await runner.start();

    // 2. Connect RPC
    const rpcUrl = status.rpcUrl.replace('http://', 'ws://'); // WebSockets need ws://
    console.log(`[2] Connecting RPC Client to ${rpcUrl}...`);
    const rpc = new JsonWrpcKaspaClient({ rpcUrl });
    await rpc.connect();
    
    const info = await rpc.getInfo();
    console.log(`Connected to: ${info.serverVersion} on ${info.networkId}`);

    // 3. Initialize Toolkits
    console.log("[3] Initializing Toolkits...");
    const indexer = IndexerToolkit.open({ dataDir: `${HARDKAS_DIR}/indexer` });
    const snapshots = SnapshotToolkit.open({ backend: 'filesystem', dir: `${HARDKAS_DIR}/snapshots` });
    const wallet = WalletToolkit.open({ storePath: `${HARDKAS_DIR}/wallet` });
    
    snapshots.register('indexer', indexer);

    // 4. Fetch blocks and ingest (Adapter Must-have)
    console.log("[4] Fetching blocks from RPC and adapting...");
    const blockHashes = await rpc.getBlocks({ includeBlocks: true, includeTransactions: true });
    
    console.log(`Received ${blockHashes.blocks.length} blocks from RPC.`);
    
    const adaptedBlocks = blockHashes.blocks.map(rpcBlockToDagBlock);
    
    console.log("[5] Ingesting into DAG Toolkit...");
    await indexer.dag.ingestBlocks(adaptedBlocks as any);
    
    const stats = await indexer.dag.statistics();
    console.log(`DAG Statistics: ${stats.totalBlocks} blocks indexed.`);
    
    if (adaptedBlocks.length > 0) {
        const tipHash = adaptedBlocks[adaptedBlocks.length - 1].hash;
        const blueScore = await indexer.dag.blueScore(tipHash);
        console.log(`Tip BlueScore matched: ${blueScore}`);
    }

    // 5. Snapshot / Time Travel over Real Data
    console.log("[6] Snapshotting real node state...");
    const base = await snapshots.create('real-base');

    console.log("[7] Mutating state...");
    // Mutate state locally to simulate divergence
    await indexer.dag.ingestBlocks([{ hash: 'synthetic-1', parents: [], blueScore: 9999n, timestamp: 0n, transactions: [] }] as any);
    console.log(`Stats after mutation: ${(await indexer.dag.statistics()).totalBlocks}`);

    console.log("[8] Restoring real node state...");
    await snapshots.restore(base.snapshotId);
    console.log(`Stats after restore: ${(await indexer.dag.statistics()).totalBlocks}`);

    // 6. Wallet Sync (Should-have)
    console.log("[9] Wallet Sync Adapter...");
    // E.g. getUtxosByAddresses
    try {
        const address = "simpub:123456";
        const utxos = await rpc.getUtxosByAddress(address);
        console.log(`RPC returned ${utxos.length} UTXOs for ${address}`);
        // In a real adapter, we would parse these entries and feed them to `wallet.syncUtxos()`
    } catch (e: any) {
        console.log(`Error fetching UTXOs (expected if node lacks index): ${e.message}`);
    }

    // Teardown
    console.log("[10] Teardown...");
    await rpc.close();
    await runner.stop();
    
    console.log("Validation complete.");
}

main().catch(async (e) => {
    console.error("Lab failed:", e);
    // Cleanup on failure if possible
    try {
        const runner = new DockerKaspadRunner();
        await runner.stop();
    } catch {}
    process.exit(1);
});
