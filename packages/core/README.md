# `@hardkas/core`

Documentation: [hardkas.dev/docs](https://hardkas.dev/docs/) · Website: [hardkas.dev](https://hardkas.dev)

The Core package provides the foundational safety rails, filesystem abstractions, and atomic persistence primitives for the entire HardKAS ecosystem.

## 1. Atomic Writes (`writeFileAtomic`)

Workspace files are written with the `temp + fsync + rename` pattern, so a crash leaves either the old file or the new one.

### Flow: Atomic Write

1. The data is written to a temporary file beside the target (`.tmp.<name>.<uuid>` in the same directory).
2. `fs.fsyncSync()` is called on the temporary file.
3. The temporary file is renamed over the target. On Windows the rename is retried a few times on `EPERM` or `EBUSY` (an antivirus or a reader holding the file).
4. Only with `fsyncParent: true`, and never on Windows, the parent directory is `fsync`ed too. That step is best effort: a failure is ignored silently.
5. The temporary file is removed in every case. Any failure is `IO_ERROR`.

## 2. Workspace Locks (`acquireLock`, `withLock`)

A lock is a file `.hardkas/locks/<name>.lock`, created with `fs.openSync(path, "wx")` (exclusive) and holding a `hardkas.lock.v1` record (`name`, `pid`, `command`, `cwd`, `hostname`, `createdAt`). Locks are taken in one fixed order (`LOCK_ORDER`) to avoid deadlocks, and an acquisition inside a call chain that already holds the lock joins it.

### Variant: The Lock Already Exists

- **Held by a live process** (its pid runs on this host, or the record names another host): without `wait` the call fails at once with `LOCK_HELD`. With `wait` it polls every 250 ms (`pollMs`) for up to `timeoutMs` (default 30 s), then fails with `LOCK_TIMEOUT`. A lock whose holder may be alive is never broken.
- **Held by a dead process on this host:** removed at once and the acquisition retried, logged as a `STALE_LOCK_RECOVERY` anomaly. If it cannot be removed, or is stale again after that one recovery, the call fails with `STALE_LOCK`.
- **Unreadable or empty** (a crash between creating the file and writing the record): younger than 2 s it is taken as still being created, and waited for; older, it is removed once (`STALE_LOCK_RECOVERY`), else `LOCK_METADATA_INVALID`.

`hardkas lock list`, `hardkas lock doctor` and `hardkas lock clear <name> --if-dead` read and clear these files.

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

## 4. Session Store

`@hardkas/core` also holds the workspace's L1/L2 session records (formerly `@hardkas/sessions`): `.hardkas/sessions.json`
(`SESSION_FILE`), read with `loadSessionStore`, `loadSessionStoreStrict` (throws on an invalid store) or
`loadSessionStoreWithDiagnostics`, written atomically by `saveSessionStore`, and changed under the workspace lock by
`createSession` and `setActiveSession`; `getActiveSession` returns the active one. A record is a `HardkasSession`
(`hardkas.session.v1`: an L1 wallet, an L2 account, a bridge mode). The dev server and the Igra L2 lab use them; the
`hardkas session` command is hidden.
