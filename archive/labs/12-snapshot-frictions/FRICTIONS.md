# Lab 12: Snapshot / Time Travel Frictions

This document captures the manual pain points of dealing with snapshots and time travel when building applications using the current HardKAS SDK without a dedicated SnapshotToolkit.

## 1. Manual File System Gymnastics
To take a snapshot, developers must recursively copy the entire `.hardkas` directory.
- This is brittle because files may be locked or streams may be open (e.g., LevelDB or SQLite locks in the future).
- Caches inside the toolkits might drift out of sync with the disk.

## 2. In-Memory State Corruption
When restoring a directory snapshot (`fs.copy(BACKUP_DIR, HARDKAS_DIR)`), the existing Toolkit instances (`JobsToolkit`, `IndexerToolkit`, `PaymentToolkit`) do not automatically reload the new state.
- Their internal caches become immediately stale.
- The developer is forced to re-instantiate or restart the entire process, preventing fluid inline scenario generation.

## 3. Comparing States
Diffing state between Point A and Point B requires manually parsing `json` files.
- E.g., `fs.readJson('.hardkas/jobs.json')` vs `fs.readJson('.hardkas-snapshots/point-a/jobs.json')`.
- This is error-prone, tightly couples the app to the SDK's internal storage format, and breaks encapsulation.

## 4. Branching and Forking
Creating a fork of the current state requires copying to a new directory (e.g., `.hardkas-snapshots/fork-1`) and then pointing all new Toolkit instances to this new custom path.
- Managing multiple branches (e.g., "Conflict A" vs "Conflict B") becomes an unmaintainable mess of directory paths.
- It is impossible to easily flip back and forth between branches during a test run.
