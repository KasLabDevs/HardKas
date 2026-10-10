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

The workspace event ledger is `<root>/events.jsonl` (`eventLedgerPath`). It is strictly append-only, and it is the
source of truth for what HardKAS recorded: while the ledger is attached to the event bus (`attachLedgerAppender`, which
the CLI does for every command), a formal `EventEnvelope` that is emitted is either in the ledger or the emit has
failed. Nothing is dropped silently (EVENT-LEDGER-2, invariant EL2-I0). The same coordinator appends the workspace
telemetry (`.hardkas/telemetry/telemetry.jsonl`), which stays best effort: a telemetry append that fails never fails a
command.

### Flow: Ledger Append (`AppendCoordinator.appendAtomic`)

1. Take the append lock `.hardkas/locks/append-<file>.lock` with `fs.openSync(path, "wx")` (atomic), and write this
   process's record into it: `hardkas.lock.v1` with `name`, `pid`, `command`, `cwd`, `hostname` and `createdAt` — the
   shape of every workspace lock, so `hardkas lock list`, `lock doctor` and `lock clear <name> --if-dead` read it.
2. If the lock exists, judge it (`judgeAppendLock`) before touching anything:
   - **live** (its pid runs on this host — including this very process, whose other flows, such as a worker thread,
     share its pid — or the file is younger than the 2 s creation grace): wait, polling every 5–20 ms for up to 10 s,
     then fail with `APPEND_LOCK_TIMEOUT`. A lock whose holder may be alive is _never_ taken over.
   - **unverifiable** (the record names another host): treated as live.
   - **abandoned** (its pid is not running on this host; or the file is empty / unreadable and older than the creation
     grace; or a record without `hostname` — written by an earlier HardKAS — whose pid is dead here and that is at
     least 60 s old): recovered without waiting. One recovery lock (`.hardkas/locks/append-<file>.recover.lock`, taken
     with `wx` and carrying its recoverer's record) serializes the recoverers; under it the lock is read again and
     removed only if it is byte for byte the content that was judged. The recovery is logged as a `STALE_LOCK_RECOVERY`
     anomaly in the workspace telemetry once the append is done.
   - An existing **recovery lock** is judged by the same rules and is never removed automatically. While its recoverer
     may be alive the append waits for it (then `APPEND_LOCK_TIMEOUT`). When its recoverer is gone — a recovery that
     stopped halfway — removing it (read, compare, unlink) could race with another recoverer, so the append fails at
     once with `APPEND_LOCK_RECOVERY_BLOCKED`: `hardkas lock doctor` lists that lock, and
     `hardkas lock clear append-<file>.recover --if-dead` (or `--force` for an empty one) clears it, after which the next
     command recovers the append lock.
3. Repair the tail of the target file if it is corrupted (below).
4. Append the JSON line (bigint payload values are written as decimal strings) and `fs.fsyncSync()` the descriptor.
5. Release: close and unlink the lock.

### Variant: the ledger cannot take an event

When the append fails (the lock stayed held by a live holder past the wait, `EACCES`, `ENOSPC` …) the attached ledger
throws `EVENT_LEDGER_APPEND_FAILED` (`EventLedgerAppendError`) out of `coreEvents.emit`, so the command fails instead
of reporting a success it cannot back. The message keeps two facts apart: the _evidence_ was not persisted, while the
_effect_ of the step that produced the event may already have taken place; it names what is known (the event kind and
id, a `txId`, an artifact id and path) without claiming a success. Nothing is spooled. Listeners registered with
`coreEvents.on` stay fire-and-forget: the ledger is a persistence sink (`coreEvents.persistWith`), not a listener.

At an execution or broadcast boundary (`sdk.tx.send`, `sdk.tx.simulate`, the workflow runner, the CLI's `tx send`
flow) the failure is rethrown with what the step had already done (`rethrowWithLedgerEffect`, `metadata.effect`), and
the message leads with it: the node accepted the submission request (RPC acceptance — not acceptance or confirmation
in the DAG), the node rejected it, the outcome is unknown (the submit call failed without an answer, so the node may
have received it), the simulator executed it, or nothing was sent or executed. A broadcast or an execution that took
place is never described as an operation that did not happen.

### Variant: Tail Corruption Repair

If the chaos engine (or a crash) leaves a partial JSON object at the tail of `events.jsonl` (e.g., `{"eventId": 142, "domain": "tx"` missing the closing brace):

1. The `AppendCoordinator` detects that the last line is not valid JSON before appending.
2. It scans backward to find the last valid newline boundary.
3. The corrupted tail is truncated automatically.
4. An `EXTERNAL_MUTATION` anomaly is logged to `telemetry.jsonl` (outside the append lock).

### Raw events

`coreEvents.normalizeAndEmit` accepts only a formal envelope; anything else is refused with `EVENT_ENVELOPE_INVALID`
(EVENT-EMISSION-1). Every artifact HardKAS writes is announced through `emitArtifactWritten`, the one boundary that
builds the `artifact.written` envelope (identity = content hash; correlation = the artifact's own `workflowId`, or the
documented `wf_unknown_standalone` marker when it has none — never a derived or invented one).
