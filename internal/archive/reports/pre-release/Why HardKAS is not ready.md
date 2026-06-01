# Why HardKAS is not ready

**The Nightmare Suite Report**

HardKAS `0.7.0-CFC` survived 8 out of 10 nightmare vectors, maintaining its semantic integrity through nuclear corruption, sigkill power-loss, filesystem abuse, and fake RPCs.

However, it critically failed to survive two specific vectors. **These are release blockers.**

## 📊 Summary of Survived Vectors (PASS)

1. **Nuclear Corruption:** SQLite deletion mid-transaction, read-only zombie locks, and raw binary garbage injected into telemetry were successfully detected and recovered by `dev doctor` and the `AppendCoordinator`.
2. **SIGKILL Power-Loss:** Force-killing the Node.js process mid-append (`kill -9`) successfully left the runtime in a degraded but parseable state that `doctor` correctly flagged for repair.
3. **Memory Pressure:** Subjecting the runtime to 100 concurrent matrix iterations with an extreme `64MB` RAM limit successfully resulted in a safe `OOM` failure without corrupting the on-disk ledger.
4. **Unicode Nightmare:** Pathological JSON payloads containing RTL Arabic, Emojis (`💩`), `CRLF`, and escape sequences were parsed perfectly, maintaining stable canonical hashes.
5. **Filesystem From Hell:** Deeply nested paths exceeding Windows `MAX_PATH` limits failed closed gracefully with `ENAMETOOLONG` warnings instead of raw crashes.
6. **Time Travel Insanity:** Replaying and snapshotting 50 rapid lineage events performed flawlessly without authority desync.
7. **Fake RPC Liar Mode:** The system correctly refused to overclaim `finalized` status on artifacts lacking explicit cryptographic proof.
8. **The Truth Test:** A static check verified that `dev doctor` does not claim `deterministic: true` without an accompanying cryptographic trace.

---

## ❌ Critical Failures (BLOCKERS)

> [!WARNING]
> HardKAS failed the following nightmare scenarios. It is not ready for the `0.7.0` release until these are resolved.

### 1. Idiot Developer (Duplicate Artifacts Bypass)

**What happened:** A simulated developer manually copied an artifact JSON file, resulting in two distinct files (`foo.json` and `bar.json`) claiming the exact same canonical hash and internal ID.
**Why it failed:** `hardkas dev doctor` **bypassed** this entirely. It checked the `events.jsonl` tail integrity but neglected to sweep the `.hardkas/artifacts/` folder for duplicate IDs or conflicting hashes.
**Impact:** Silent corruption of the SQLite projection. If the CLI assumes artifact IDs are unique but the filesystem has duplicates, the database index will quietly overwrite or hallucinate data.

### 2. Parallel Hell (Stack Buffer Overrun)

**What happened:** We unleashed 5 `doctor` checks, 5 `inspect` commands, 3 `rebuilds`, and 2 `torture matrix` processes simultaneously on the exact same workspace for 5 minutes.
**Why it failed:** `dev doctor` crashed fatally with **Exit Code 3221226505** (`STATUS_STACK_BUFFER_OVERRUN`).
**Impact:** This is a fatal native C++ crash, likely caused by `sqlite3` or the Node.js `fs` module hitting concurrent file-locking exhaustion on Windows. While the ledger itself wasn't corrupted, crashing the user's terminal with a raw stack buffer overrun violates the graceful-fail contract.

---

### Next Steps

Before we can release HardKAS, we must:

1. Update `packages/cli/src/runners/dev-doctor-runner.ts` to actively scan the `.hardkas/artifacts/` directory for duplicate internal IDs and mark the workspace as `corrupt` if any are found.
2. Investigate the SQLite / Node.js native crash under extreme parallel load to ensure `dev doctor` catches the `EBUSY` error in user-land before it triggers a C++ stack buffer overrun.
