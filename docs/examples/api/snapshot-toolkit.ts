import { IndexerToolkit, JobsToolkit, SnapshotToolkit } from '@hardkas/toolkit';

async function main() {
    // 1. Initialize your components
    const indexer = IndexerToolkit.open({ dataDir: '.hardkas/indexer' });
    const jobs = JobsToolkit.open({ storePath: '.hardkas/jobs.json' });

    // 2. Initialize the Snapshot Toolkit
    // Using 'filesystem' generates `snapshot.v1` evidence manifests
    const snapshots = SnapshotToolkit.open({ backend: 'filesystem', dir: '.hardkas-snapshots' });
    
    // 3. Register the components that have a living state
    snapshots.register('indexer', indexer);
    snapshots.register('jobs', jobs);

    // 4. Do some work
    await jobs.enqueue('payment', { to: 'kaspa:alice', amount: 100 });

    // 5. Create a snapshot "Point A"
    const pointA = await snapshots.create('point-a');
    console.log(`Created snapshot: ${pointA.name} with ID: ${pointA.snapshotId}`);

    // 6. Mutate the state again
    await jobs.enqueue('payment', { to: 'kaspa:bob', amount: 200 });

    // 7. Time Travel: Restore to Point A
    // This will reload all internal states (caches, queues, projections) automatically!
    await snapshots.restore(pointA.snapshotId);
    console.log('Restored state back to Point A!');

    // 8. Create an alternative branch/timeline
    const fork = await snapshots.branch(pointA.snapshotId, 'point-a-experiment');
    console.log(`Created branch: ${fork.name}`);
}

main().catch(console.error);
