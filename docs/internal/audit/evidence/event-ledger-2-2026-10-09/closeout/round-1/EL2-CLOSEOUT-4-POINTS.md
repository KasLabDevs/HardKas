# EVENT-LEDGER-2 · REVIEW HOLD closeout (4 points)

**Base:** hk-ra, on top of the EL-2 tree the reviewer already saw (`ac80a9a8`, base `71ff614f9`).

**Not done:**
- no commit, push or version;
- nothing applied to the main checkout;
- the 4 JSON-PAPERCUTS files not touched;
- the general `core/src/lock.ts` untouched;
- the demo's localnet untouched;
- the full gate not re-run (as ordered).

## Summary

| Point | Status |
|---|---|
| **1 · emit contract** | **Map + alternatives below. STOP: decision needed.** No public API changed. |
| **2 · submission semantics** | **Fixed with existing types.** `workflow.submitted` only after an *accepted* submission; `workflow.failed` if it failed or was refused. A catalog type for the *intent* is proposed, **not** implemented. |
| **3 · same pid** | **Fixed.** A lock that names this very process counts as `live`: waited for, never taken over. Regression with a worker thread. |
| **4 · recovery race** | **Fixed.** The `.recover` mutex carries its recoverer's record and is never removed while that recoverer may be alive, however long it takes. Two tests with an adversarial schedule. |

## BEFORE / AFTER (hermetic runner; 0 non-loopback connections)

| Run | Result |
|---|---|
| `cl-before-1` (current EL-2) | **6/6 red, each for the reason the reviewer named.** Exit 1; 2 files, 6 tests. |
| `build-closeout-1` | 24/24 tasks. |
| `cl-after-1` | **39/39 green**, exit 0, 6 files. Covers the 6 new tests, the 19 EL-2 core tests, the 8 CLI EL-2 tests, the guard, and the existing `wave1-3-b2-workflow-rejected-send` (related). |

**Note on timing:**
- The `packages/core/README.md` §3 text was edited after `cl-after-1`. The edit is prose only.
- No test or checker reads that file: `docs-drift` reads the root README + `docs/`, and `docs-check` reads the root `.md` files.
- The later full gate covers it.

What each BEFORE test showed:
- **CL-3:** the worker thread's lock was taken over.
- **CL-4a:** a live recoverer's mutex was removed for being "old".
- **CL-4b:** the suspended recoverer deleted the lock of holder C, which came after it.
- **CL-2 (failed broadcast):** `workflow.submitted` was recorded anyway.
- **CL-2 (`accepted:false`):** the same.
- **CL-2 (accepted broadcast):** `workflow.submitted` was already in the ledger *before* `submitTransaction` was called.

**One deliberate test change:** `core/test/event-ledger-2.test.ts` expected `abandoned` for a record naming the process's own pid. It now expects `live`, by the reviewer's decision (point 3).

## 1 · Emit contract: map of call sites

The current state of EL-2: `emit` throws `EVENT_LEDGER_APPEND_FAILED` when the persistence sink fails. Only the CLI attaches that sink; an SDK used as a library has no sink, so it never throws.

| Call site | When it fires | What the user sees today if the ledger fails | Effect identified? |
|---|---|---|---|
| `cli/runners/tx-flow.ts:185` `workflow.started` | **before** any effect (outside the `try`) | typed `EVENT_LEDGER_APPEND_FAILED`, exit 1, nothing executed | ✅ correct |
| `cli/commands/tx.ts:216` (`tx plan`) / `:362` (`tx sign --out`) | after writing an artifact (no chain effect) | typed: "The artifact X WAS written at P; only its ledger entry is missing" | ✅ |
| `sdk/artifacts-manager.ts:192` (every `artifacts.write`): signed `tx.ts:917/1175`, plans `:1218/1240/1398`, observation `:233`, replay report `replay.ts:252`, `task.ts:138`, plugins `plugin-manager.ts:147/172` | after writing an artifact | typed, naming the artifact | ✅ (no chain effect) |
| `localnet/replay.ts:164`, `testing/scenarios.ts:143` | no chain effect | typed | ✅ |
| `cli/runners/tx-flow.ts:233/265/283/328/356` (plan, signed, their copies) | after plan or sign | **tx-flow's `catch` (line 467) swallows the typed code**: `steps.plan/sign.error = message`, `ok:false`, "sign error" even though signing happened | ⚠️ code lost |
| **`sdk/tx.ts` `simulate()` → announcement of the receipt** | **after the simulator's durable commit** (balances changed) | typed, but the message speaks of the receipt *artifact*, **not** of "the payment WAS executed" | ❌ ambiguous effect |
| **`sdk/tx.ts` `send()` → `artifacts.write(submission)`** | **after the broadcast** | typed, naming the submission artifact, **without saying the transaction WAS submitted** | ❌ ambiguous effect |
| `sdk/tx.ts` `send()` → result event (`workflow.submitted`/`failed`, point 2) | after the broadcast | the identity carries the txId: "Transaction X may already have been executed or submitted: do not send it again before checking it" | ⚠️ "may", although it is known |
| **`cli/runners/tx-flow.ts:416/434`** `workflow.receipt` + receipt copy | **after the broadcast or execution** | **swallowed by tx-flow's `catch`**: `steps.send = {status:"error"}`. The flow **loses `sendResult` (txId, receipt)** and the code; the txId survives only inside the message text | ❌ |
| `sdk/workflow.ts:195/207/268/281` (receipts after send/simulate) | after the broadcast or execution | `errorEnvelope.code = EVENT_LEDGER_APPEND_FAILED` (kept); the step is marked `failed` even though the effect happened | ⚠️ |

**Conclusion of the map:**
- Before effects, and in steps that only write artifacts, the throw is correct and tells the two cases apart.
- After an **irreversible effect** (a simulator commit, a broadcast), it does **not**: the message names the artifact, not the operation that already happened.
- tx-flow additionally loses the code and the txId.
- That is exactly the risk the reviewer named: it reads as "it did not run" when it did.

### Alternatives (no public API changed without a GO)

**A1 · keep the throw (D2) and enrich it at the effect boundaries.**
- In `send()` after the broadcast, and in `simulate()` after the commit, catch `EVENT_LEDGER_APPEND_FAILED` and rethrow the same code with `metadata.effect` = `"broadcast"` | `"executed"` and `metadata.operation = {txId, submission/receipt artifactId, path, accepted}`.
- The message would say: "Transaction X WAS submitted/executed (evidence in artifact Y at P); only the ledger event is missing. Do not send it again."
- tx-flow would rethrow `EVENT_LEDGER_APPEND_FAILED` instead of swallowing it, and keep `sendResult`.
- Cost: small, about 4 call sites. The bus contract stays "emit may throw when a ledger is attached", documented.

**B · emit never throws; the failure is deferred.**
- The sink records each lost event, and `coreEvents` gains an additive API: `lostEvents()`, plus `assertNoLostEvents()` as a checkpoint *before* irreversible effects (the broadcast, the simulator commit).
- The operation finishes and reports its result as usual (txId, receipt). At the end, the CLI adds `EVENT_LEDGER_APPEND_FAILED` with the list of lost events and a distinct exit code.
- Cost: an additive API in core, the CLI entry, and the output layer (the JSON envelope carries `evidence: {complete:false, lost:[…]}`). The bus contract stays the same as before EL-2.

**Recommendation:**
- **A1** if "emit may throw with an attached ledger" is accepted as the contract: it is smaller, and it keeps the fail-fast behavior before effects.
- **B** if the bus must never throw: it is cleaner for library embedders, but bigger.
- **STOP:** I implement neither without a GO.

## 2 · Submission semantics (fixed)

`sdk/tx.ts` `send()`:
- **removed** the `workflow.submitted` emitted before `submitTransaction`;
- after the answer, and once the submission artifact is written:
  - `submitResult.accepted` → `workflow.submitted` `{txId, rpcUrl redacted}`;
  - otherwise → `workflow.failed` `{workflowId, error: "submission not accepted: <node error>"}`;
  - both under the signed artifact's `workflowId` (or the documented standalone marker), with `artifactId` = the **submission** contentHash and `txId` = the submission's;
- nothing is derived or invented.

**Tests (CL-2):**
- a broadcast that throws → no `submitted`, `workflow.failed` naming the submission;
- `accepted:false` → the same;
- accepted → `submitted` appears **only after** the call answered, naming the submission artifact.

**Catalog proposal (not implemented):** `workflow.submission.requested` `{txId, signedArtifactId, rpcUrl}`, emitted *before* the broadcast.
- It would restore "evidence first": if the ledger cannot record the intent, nothing is broadcast. That property disappears when the old `submitted` is removed.
- It requires a GO and a catalog change.

## 3 · Same pid (fixed)

- `judgeAppendLock`: a record whose pid is this process's → `live` ("held by this process, through another of its flows").
- **Cost (documented):** a leftover from an earlier process that had the same pid costs one 10 s wait plus a typed failure (never silent). The next process, with a different pid, recovers it.
- **Test CL-3:** a `worker_thread` holds the lock with a record naming `process.pid` for 1.5 s. The main thread waits, appends when the worker releases it, and the worker confirms its lock was intact.

## 4 · Recovery race (fixed)

- `recoverAbandonedLock`: the mutex writes `hardkas.lock.v1` with `name: append-<file>.recover`, pid, hostname and createdAt.
- An existing mutex is judged by the same rules:
  - `live`, `unverifiable` or own pid → **never removed**; the recovery waits, and if it runs out of time, `APPEND_LOCK_TIMEOUT` names "a recovery of it is in progress";
  - `abandoned` (a dead pid here, or empty/unreadable past the 2 s grace) → removed only if it is byte-identical to what was judged.
- Release only removes the mutex this call itself wrote.
- **The exported `APPEND_RECOVER_MUTEX_STALE_MS` is removed** (the age-based clearing); the core README is updated.
- **CL-4a:** recoverer A is alive with a one-hour-old mutex → the append waits and fails typed; **A's mutex is intact**.
- **CL-4b:** A is suspended for 3 s between its check and its unlink, while holder C waits. Nobody touches A's mutex; when A finishes, C takes the lock; **C's lock is intact** and the ledger's event is persisted or its loss is typed.

**Invariant held:** while a recoverer holds the mutex, nobody else removes the abandoned lock, so no new holder can appear between its check and its unlink.

**Residual window (documented):**
- Two *live* recoverers clear at the same time the mutex of a third, *dead* recoverer. Both re-read and compare before unlinking, which leaves a window of microseconds.
- Breaking exclusivity would further require one of them to stall exactly inside that window.
- That window does not involve living holders or living recoverers.

## Incremental diff

| | |
|---|---|
| Compared against | full EL-2 tree `ac80a9a82fbdbd71ae9c95dabc65abf378dd4a41` (the reviewed `manifest-final-f1`) |
| New full tree (EL-2 + closeout + unchanged evidence) | `b5e9fde9834a42c3f111bb019567f082f3f48a3a` |
| Patch | `closeout/closeout-incremental.patch`, written by `git diff-tree -p --binary --output` |
| Patch sha256 | `2db0f304c1982106e40b5564b588e4bd516ab89d68a021f99f695123031e213c` |
| Size | 6 files, +382 / −62 |
| Blobs per path | `closeout/incremental-blobs.txt` |

| Path | Change | Blob |
|---|---|---|
| `packages/core/README.md` | M | `0dbea06e` |
| `packages/core/src/append-coordinator.ts` | M | `37f64762` |
| `packages/core/test/event-ledger-2-closeout.test.ts` | A | `c35163e6` |
| `packages/core/test/event-ledger-2.test.ts` | M (one expectation) | `26734ae6` |
| `packages/sdk/src/tx.ts` | M | `5eafa0b4` |
| `packages/sdk/test/event-ledger-2-submission.test.ts` | A | `5973372d` |

- The tree was computed with a temporary index (read-tree HEAD + add -A). hk-ra's real index is untouched: `diff --cached --quiet` exits 0.
- The build's side effect (the pskt `.node`) was restored before computing it, and the wave1-1 snapshot is clean.
- An earlier draft of the patch (5 files, made before the README edit) was moved to `closeout/superseded/`.
- The evidence folder (LEDGER, MANIFEST) is still the reviewed one. It is updated only after the point 1 decision and the full gate.

## Invariants (closeout)

- **CL-1:** pending the point 1 decision.
- **CL-2:** no `workflow.submitted` without an accepted submission; a failed or refused one is recorded as such, naming its submission artifact.
- **CL-3:** a lock whose holder may be alive is never taken over, even when the pid is this process's.
- **CL-4:** a recovery whose recoverer may be alive is never taken over; while it lasts, nobody else removes the abandoned lock.

## Closure proposal

1. The reviewer decides point 1 (**A1** or **B**) and, optionally, the intent type.
2. Implement the chosen option, then a focused AFTER.
3. **One** full gate.
4. Manifest and tree.
5. Update the LEDGER (§2, §7, §8 + the closeout).
6. GO for integration.
