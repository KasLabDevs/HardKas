import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SnapshotToolkit } from '../src/snapshot/index.js';
import { JobsToolkit } from '../src/jobs.js';
import fs from 'fs-extra';
import path from 'path';

describe('SnapshotToolkit (Time Travel)', () => {
    let snapshots: SnapshotToolkit;
    let jobs: JobsToolkit;

    const testDir = path.join(process.cwd(), '.test-snapshots');

    beforeEach(async () => {
        await fs.ensureDir(testDir);
        snapshots = SnapshotToolkit.open({ backend: 'filesystem', dir: testDir });
        jobs = JobsToolkit.open({ storePath: path.join(testDir, 'jobs.json') });
        snapshots.register('jobs', jobs);
    });

    afterEach(async () => {
        await fs.remove(testDir);
    });

    it('should save, mutate, and restore state', async () => {
        // State 1
        await jobs.enqueue('payment', { to: 'alice' });
        const s1 = await snapshots.create('state1');

        let job1 = await jobs.getJob((await jobs.snapshot() as any)[Object.keys(await jobs.snapshot())[0]].id);
        expect(job1).toBeDefined();

        // Mutate State 2
        await jobs.enqueue('payment', { to: 'bob' });
        
        let stateKeys = Object.keys(await jobs.snapshot());
        expect(stateKeys.length).toBe(2);

        // Restore State 1
        await snapshots.restore(s1.snapshotId);

        // Verify restored
        stateKeys = Object.keys(await jobs.snapshot());
        expect(stateKeys.length).toBe(1); // bob's job is gone

        // Branch from State 1
        const b1 = await snapshots.branch(s1.snapshotId, 'experiment-a');
        expect(b1.name).toBe('experiment-a');
    });

    it('should handle partial restore failures gracefully', async () => {
        // Enqueue some initial jobs
        await jobs.enqueue('payment', { to: 'alice' });
        const base = await snapshots.create('base');

        // Register a malicious participant that fails on restore
        const failingParticipant = {
            snapshot: async () => ({ bad: 'state' }),
            restore: async () => { throw new Error('Simulated restore failure'); },
            reload: async () => {}
        };
        snapshots.register('failing', failingParticipant);
        const badSnapshot = await snapshots.create('bad');

        // Restore should throw and mention the participant
        await expect(snapshots.restore(badSnapshot.snapshotId)).rejects.toThrow(/Failed to restore participant 'failing'/);
    });

    it('should fail if participant is missing on restore', async () => {
        await jobs.enqueue('payment', { to: 'alice' });
        const base = await snapshots.create('base');

        // Unregister a participant by creating a new snapshots instance
        const newSnapshots = SnapshotToolkit.open({ backend: 'filesystem', dir: testDir });
        // Didn't register 'jobs' this time

        await expect(newSnapshots.restore(base.snapshotId)).rejects.toThrow(/not registered/);
    });

    it('should generate deterministic diffs and valid filesystem manifests', async () => {
        await jobs.enqueue('payment', { to: 'alice' });
        const s1 = await snapshots.create('s1');

        await jobs.enqueue('payment', { to: 'bob' });
        const s2 = await snapshots.create('s2');

        const diff = await snapshots.diff(s1.snapshotId, s2.snapshotId);
        expect(diff).toHaveProperty('jobs');
        
        // Assert filesystem manifest created properly
        const manifestPath = path.join(testDir, s1.snapshotId, 'manifest.json');
        expect(await fs.pathExists(manifestPath)).toBe(true);

        const manifest = await fs.readJson(manifestPath);
        expect(manifest.schema).toBe('hardkas.snapshot.v1');
        expect(manifest.backend).toBe('filesystem');
        expect(manifest.participants).toContain('jobs');
        expect(manifest.stateHashes).toHaveProperty('jobs');
    });
});
