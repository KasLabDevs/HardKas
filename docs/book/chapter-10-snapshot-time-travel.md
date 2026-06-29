# Chapter 10: Snapshot & Time Travel

HardKAS is designed to simulate complex Kaspa scenarios locally. When dealing with payments, jobs, and indexing, the runtime manages a living state (caches, queues, and file stores).

Manually copying files to backup and restore state is error-prone and leads to stale in-memory caches. To solve this, HardKAS provides the **Snapshot Toolkit**.

## The Snapshot Participant Model

Instead of guessing what to copy, HardKAS requires components to implement the `SnapshotParticipant` interface. 
A participant knows how to:
1. `snapshot()`: Extract its complete internal state.
2. `restore(state)`: Replace its current state with a provided state.
3. `reload()`: Clear caches and resynchronize with the newly restored state.

## Usage

```typescript
import { SnapshotToolkit, JobsToolkit } from '@hardkas/toolkit';

// 1. Initialize Manager
const snapshots = SnapshotToolkit.open({ backend: 'filesystem', dir: '.hardkas-snapshots' });

// 2. Register Participants
const jobs = JobsToolkit.open();
snapshots.register('jobs', jobs);

// 3. Create Snapshots At Any Time
const base = await snapshots.create('base-scenario');

// 4. Time Travel
await snapshots.restore(base.snapshotId);
```

## Evidence Manifests

When using the `filesystem` backend, the Snapshot Toolkit follows the **Evidence-First** philosophy.
It generates a `snapshot.v1` JSON manifest. This manifest does not dump the entire state inline. Instead, it serves as a cryptographic pointer to the state hashes and the local path where the state resides, ensuring your evidence artifacts remain lightweight and verifiable.
