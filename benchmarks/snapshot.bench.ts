import { bench, describe } from 'vitest';
import { SnapshotToolkit } from '@hardkas/toolkit';

describe('SnapshotToolkit Benchmarks', () => {
    let snapshots: SnapshotToolkit;

    bench('init snapshot store', async () => {
        snapshots = await SnapshotToolkit.open({ storePath: ':memory:' });
    });

    bench('create snapshot', async () => {
        if (!snapshots) return;
        await snapshots.create('snap-A');
    });

    bench('restore snapshot', async () => {
        if (!snapshots) return;
        await snapshots.restore('snap-A');
    });

    bench('diff deterministic', async () => {
        if (!snapshots) return;
        await snapshots.create('snap-B');
        await snapshots.diff('snap-A', 'snap-B');
    });
});
