# `@hardkas/core`

The Core package provides the foundational safety rails, filesystem abstractions, and atomic persistence primitives for the entire HardKAS ecosystem.

## 1. Atomic Persistence Variants

All state mutation in HardKAS relies on strict atomic persistence to prevent corruption during unexpected crashes or power loss. The standard flow follows the `temp + rename + fsync` pattern.

### Flow: Standard Atomic Write

1. Data is written to a temporary file (`.hardkas/tmp/<uuid>.json`).
2. `fs.fsyncSync()` is called on the temporary file to flush buffers to disk.
3. The temporary file is atomically renamed over the target file (e.g., `state.json`).
4. `fs.fsyncSync()` is called on the **parent directory** (`.hardkas/`) to ensure the directory entry is durably linked.

### Variant: Fallback Write

If the filesystem does not support directory `fsync` (e.g., certain Windows/WSL configurations), the engine catches `EINVAL` or `EISDIR` and gracefully degrades to a standard atomic rename without the parent directory flush, logging a warning to the telemetry stream.

## 2. Workspace Lock Mechanisms

To prevent concurrent modifications to the developer workspace, `@hardkas/core` uses a conservative file-based locking strategy (`.hardkas/locks/<domain>.lock`).

### Flow: Lock Acquisition

1. Process attempts to create a lock file using `fs.openSync(path, 'wx')` (exclusive write).
2. If successful, the process PID and timestamp are written.
3. If `EEXIST` is thrown, the process enters a **spin-wait loop** with exponential backoff (up to 30 seconds).

### Variant: Stale Lock Detection & Recovery (LockHell Defense)

If a lock cannot be acquired after 30 seconds, the engine checks if the holding process is still alive.

- **Dead Process:** If `process.kill(pid, 0)` fails (indicating the PID no longer exists), the lock is deemed **stale**. The engine atomically overrides the lock and logs a `STALE_LOCK_RECOVERY` telemetry event.
- **Live Process:** If the PID is active, HardKAS strictly aborts with `HARDKAS_LOCK_CONTENTION`. It will _never_ violently break a lock held by a live process.
- **Zero-Byte Locks:** If a system crash occurs precisely when the `wx` descriptor is created but before the PID is written (a TOCTOU scenario), HardKAS considers any 0-byte lock older than 10 seconds as implicitly stale.

## 3. AppendCoordinator (Event Ledger)

The `events.jsonl` ledger is the source of truth for the workspace. It is strictly append-only.

### Flow: Ledger Append

1. Acquire the exclusive `events` lock.
2. Read the tail of the stream to determine the last `eventId`.
3. Append the new JSON payload with a trailing newline.
4. `fs.fsyncSync()` the file descriptor.

### Variant: Tail Corruption Repair

If the chaos engine (or a crash) leaves a partial JSON object at the tail of `events.jsonl` (e.g., `{"eventId": 142, "domain": "tx"` missing the closing brace):

1. The `AppendCoordinator` detects `Unexpected end of JSON input` during tail-read.
2. It explicitly scans backward to find the last valid newline boundary.
3. The corrupted tail is truncated automatically.
4. A `CORRUPT_TAIL_RECOVERY` event is dispatched to `telemetry.jsonl`.
