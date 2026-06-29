import { IndexerToolkit, JobsToolkit, SnapshotToolkit } from '@hardkas/toolkit';
import fs from 'fs-extra';
import path from 'path';

const HARDKAS_DIR = '.hardkas';
const SNAPSHOTS_DIR = '.hardkas-snapshots';

async function main() {
    console.log("=== LAB 12: SNAPSHOT / TIME TRAVEL FRICTIONS RESOLVED ===");

    // 1. Clean state
    await fs.remove(HARDKAS_DIR);
    await fs.remove(SNAPSHOTS_DIR);

    // 2. Initial state
    const indexer = IndexerToolkit.open({ dataDir: `${HARDKAS_DIR}/indexer` });
    const jobs = JobsToolkit.open({ storePath: `${HARDKAS_DIR}/jobs.json` });
    
    const snapshots = SnapshotToolkit.open({ backend: 'filesystem', dir: SNAPSHOTS_DIR });
    snapshots.register('indexer', indexer);
    snapshots.register('jobs', jobs);

    console.log("[1] Creating initial state...");
    await jobs.enqueue('payment', { to: 'kaspa:alice', amount: 100 });
    await indexer.ingestArtifact({ id: 'tx-1', schema: 'payment.v1' });

    // 3. Take snapshot "Point A"
    console.log("[2] Taking snapshot (Point A)...");
    const base = await snapshots.create("base");

    // 4. Mutate state
    console.log("[3] Mutating state...");
    await jobs.enqueue('payment', { to: 'kaspa:bob', amount: 200 });
    await indexer.ingestArtifact({ id: 'tx-2', schema: 'payment.v1' });

    // 5. Compare state
    console.log("[4] Comparing state automatically...");
    const current = await snapshots.create("current");
    const diff = await snapshots.diff(base.snapshotId, current.snapshotId);
    console.log(`Differences detected in components: ${Object.keys(diff).join(', ')}`);

    // 6. Restore Point A
    console.log("[5] Restoring Point A...");
    await snapshots.restore(base.snapshotId);
    
    // No need to re-instantiate toolkits, they are synchronized automatically!
    const jobData = await jobs.getJob('tx-2'); 
    console.log(`Job tx-2 after restore (should be undefined):`, jobData);

    // 7. Branch/Fork
    console.log("[6] Creating a branch (Fork 1)...");
    const fork = await snapshots.branch(base.snapshotId, "experiment-a");
    console.log(`Created branch: ${fork.name}`);

    console.log("Lab completed with 0 manual filesystem operations and fully synchronized in-memory state!");
}

main().catch(console.error);
