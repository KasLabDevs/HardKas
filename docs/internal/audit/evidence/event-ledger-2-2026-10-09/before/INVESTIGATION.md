# EVENT-LEDGER-2 · investigation + BEFORE

**Base:** develop `71ff614f9`, tree `ec67d31c`, the rc.27 content.
- No product changes, commits or versions.
- In the isolated worktree hk-ra, the only additions are the two BEFORE test files (untracked).
- Runtime: hermetic, with 0 non-loopback connections. The demo's localnet was not touched.

## 1. What HardKAS promises

- `packages/core/README.md` §3: "The `events.jsonl` ledger is the source of truth for the workspace. It is strictly append-only."
- `attachLedgerAppender` (`core/src/events.ts:310-313`): "This guarantees that all formal EventEnvelopes are persisted to events.jsonl."
- The CLI README: "verify the evidence of every step".

## 2. What actually happens (runtime on rc.27, `runs/probes-1`)

| Probe | Result |
|---|---|
| **P1** append lock left by a dead process | A reference `tx send` takes 3.3 s and records **10 events**. With the leftover lock: **102 s, exit 0, `ok:true`, empty stderr, 0 of 10 events, and the lock stays** for the next command. |
| **P2** what the tools say | `lock list` → `"isAlive": true` ("State: live", Command/Created "undefined"). `lock doctor` → **"✓ All 1 active lock(s) are held by live processes."** (exit 0). Both false: the holder is dead. |
| **P3** the same coordinator on telemetry | With a dead telemetry lock, a `tx plan` goes from 3.9 s to **11.9 s**, and the anomaly is lost, including the `STALE_LOCK_RECOVERY` that `lock.ts` writes when it recovers another lock. |
| **P4** kinds in the ledger | plan → sign → send leaves **only 2 `artifact.written`**; plan and sign leave nothing. Only the shortcut `send` records `workflow.started/signed/receipt` + `artifact.written`. |
| **P5** `dag simulate-reorg` | It changes `.hardkas/localnet.json` and **records nothing**: no event, no artifact. |

## 3. Causes (code at `71ff614f9`)

- **C1 · `core/src/append-coordinator.ts:32-55`.**
  - The lock `.hardkas/locks/append-<file>.lock` is taken with `wx`.
  - It writes `{pid, time}`, which nobody reads, and no `hostname`.
  - If the lock exists it spins for 10 s and throws.
  - **There is no owner check**: a lock whose holder died blocks forever.
- **C2 · The errors are swallowed.**
  - `attachLedgerAppender` (`events.ts:334-339`) catches **every** append error ("Fire-and-forget for now").
  - `CoreEventBus.emit` (`events.ts:203-211`) swallows the listeners' exceptions.
  - So a lock, EACCES or ENOSPC all end the same way: the event is lost, exit 0, and nothing is said.
- **C3 · EVENT-EMISSION-1.**
  - `normalizeAndEmit` (`events.ts:217-224`) silently discards everything that is not an envelope.
  - 13 raw sites: `sdk/src/tx.ts` ×8, `kaspa-rpc/src/json-rpc-client.ts` ×3, `cli/src/runners/tx-plan-runner.ts:483`, `testing/src/scenarios.ts:141`.
  - Their kinds (`tx.signed`, `artifact.created`) **are not in the catalog** (`EventPayloadByKind`).
  - Their objects carry no `workflowId`/`correlationId`, so they cannot be "normalized" without inventing a correlation.
- **C4 · Artifacts that are never announced.**
  - `tx plan` and `tx sign --out` write with `writeArtifact` directly (`cli/src/commands/tx.ts:213`, `:235`, `:348`), outside `sdk.artifacts.write`, which is what emits `artifact.written`.
  - So whether an artifact is in the ledger depends on the path that wrote it.
- **C5 · False diagnostics.** `listLocks`/`lock doctor` (`core/src/lock.ts:387` and the doctor) treat a lock with no `hostname` as remote, hence "alive". The event lock never writes a `hostname`.
- **C6 · `cli/src/runners/dag-runners.ts:53-95`.** The reorg changes the simulated state and emits or writes nothing.
- **C7 · Telemetry.** `core/src/telemetry.ts:149-155` uses the same coordinator.
  - It swallows errors by design.
  - But a dead lock costs it 10 s on every append.
- **C8 · Out-of-date doc.** The core README §3 describes "the `events` lock", reading the last `eventId`, and `CORRUPT_TAIL_RECOVERY`. The code uses `append-events.jsonl.lock`, reads no eventId, and logs `EXTERNAL_MUTATION`.

**Relevant if `lock.ts` is reused.** `acquireLock` does recover a dead holder and a corrupt lock by age. But:
- it is async, while the ledger is synchronous, inside a listener;
- it reads and then unlinks without re-checking (a TOCTOU window between two recoverers);
- its liveness is PID-only, so a PID reused by another process looks alive.

## 4. BEFORE (new tests, no product changes)

Files, untracked in hk-ra:
- `packages/core/test/event-ledger-2.test.ts`;
- `packages/cli/test/event-ledger-2.test.ts`.

**Invariants:**
- **EL2-I1:** a lock whose holder is gone (a dead process, or an empty/unreadable lock past the creation grace) never costs an event. It is recovered and leaves no stale lock.
- **EL2-I2:** an event offered to the bus is never discarded silently. When a command's events cannot be persisted, the command does not report a clean, silent success, and a live holder's lock is never taken over.
- **EL2-I3:** `dag simulate-reorg` leaves evidence of its change, as an event or an artifact.
- **EL2-I4:** an artifact a command writes is announced in the ledger.
- **Controls:**
  - a plain append;
  - a live holder is waited for and not taken over;
  - a `send` without a lock records its events and leaves no lock.

**BEFORE files.** Blobs, with copies in `before/`:
- core `3bfb788e`;
- cli `ea14dcbd`.

All three runs are kept, each with its cause classified:

| Run | What | Result |
|---|---|---|
| `el2-before-1` | both files | **core: 4 red + 2 controls green** ✓. **CLI: invalid as a BEFORE.** The control used `tx plan`, which records no events (that is EL2-I4's defect), so EL2-I1/I2 went red for the wrong reason, in 1.4–2.2 s with no wait. A test bug; fixed by switching to the shortcut `tx send`, letting the holder outlive the command, and adding EL2-I4. |
| `el2-before-2` | both files | **core identical to run 1** (4 red + 2 controls). The gate process **ended with −1 at 3.2 min** during EL2-I2 (CLI): no Windows crash record, no JSON report. Classified as an **environmental termination, cause unknown**; it did not happen again in run 3. |
| `el2-before-3` | CLI only, verbose | **control ✓** (1.7 s) · **EL2-I1 ×** (101.5 s; `recorded:false`) · **EL2-I2 ×** (exit 0 in 101.3 s, ledger 0 → 0, said nothing) · **EL2-I3 ×** (state changed, `evidence:false`) · **EL2-I4 ×** (`announced:false`). vitest finished normally; 0 non-loopback connections. |

**The BEFORE discriminates:**
- **core:** 4 defects red (dead PID, empty lock, unreadable lock, raw event discarded) and 2 controls green (plain append, live holder waited for and not taken over);
- **CLI:** 4 defects red and 1 control green.

## 5. Decisions for the reviewer

- **D1 · Recovering a dead holder (EL2-I1).** Proposal:
  - the coordinator's owner record gains `hostname`;
  - on `EEXIST` it reads the lock:
    - a holder on this host that is dead → recover;
    - empty or unreadable, older than a creation grace → recover;
    - live → wait, as today.
  - Safe recovery: one `.recover` mutex (`wx`) serializes the recoverers. Under it, the lock is re-read, and only removed if it is **byte-for-byte** the one judged stale.
  - A recovery is recorded: an anomaly, plus a ledger event if the decision is to make it evidence.
  - **The 10 s wait does not change** ("no timeout tweak").
- **D2 · When an event cannot be persisted** (a live holder past the wait, EACCES, ENOSPC). Options:
  - (a) the command fails with a typed code (e.g. `EVENT_LEDGER_APPEND_FAILED`) and names the events lost, saying that the command's effects did happen;
  - (b) a durable spool (`.hardkas/events.pending/…`) merged on the next append;
  - (c) a warning only, with exit 0.
  - **Recommendation: (a).** Evidence first, the minimum guarantee, and (b) can come later. A loss in the SDK used as a library would be exposed through the API (for example, a failure returned by `emit`, or the SDK's ledger state).
- **D3 · EVENT-EMISSION-1.** Options:
  - (a) map every raw site to catalog kinds, with the real correlation where it exists;
  - (b) remove the raw emissions and make `normalizeAndEmit` strict (throw), plus a static guard;
  - (c) a mix: announce every artifact (D4), convert to envelopes only where the correlation is known, and remove the rest explicitly.
  - **Recommendation: (c).** Never invent a correlation.
- **D4 · Announce every artifact written** through a single sink: `writeArtifact` for the store and for `--out`, or route `tx plan`/`sign` through `sdk.artifacts.write`.
- **D5 · Reorg evidence:** in EL-2 (a ledger event or artifact), or in SIMULATOR-STATE-TRUST-1. EL2-I3 accepts either.
- **D6 · Telemetry:** the D1 recovery covers it, but telemetry would stay best-effort, not failing a command.
- **D7 · The truth of `lock list`/`lock doctor`** about these locks: hostname + real liveness. Same family; I propose it in EL-2.
- **D8 · The SDK as a library** does not attach the ledger, so it persists nothing unless the user attaches it. Options: document it, or attach it in `Hardkas.open/create`, idempotent per `eventId`.
- **D9 · Fix the core README §3** together with the wave.

## 6. Out of scope (not touched)

- The general `lock.ts` (its TOCTOU and PID-only liveness): it is used by every workspace lock, and changing it would be WORKSPACE-AUTHORITY-2 or STORE-CONCURRENCY.
- `lock doctor --json` does not exist: CLI-CONTRACT-2.
- No timeouts were changed and no gate was run, as for a BEFORE.
