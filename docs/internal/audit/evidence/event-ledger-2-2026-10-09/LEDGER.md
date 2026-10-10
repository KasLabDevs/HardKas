# EVENT-LEDGER-2 · ledger (2026-10-09)

Isolated worktree `%TEMP%\hk-ra\wt`, detached at develop `71ff614f9` (tree `ec67d31c`, the rc.27 content). The
owner's checkout was not touched. No commit / push / bump: the owner applies the working tree.

Investigation and BEFORE: 2026-10-07 (`before/INVESTIGATION.md`, `before/tests/*`, `before/logs/*`,
`before/probes/*`). GO of the reviewer: 2026-10-07, scope "append coordinator recovery + no silent formal-event loss +
EVENT-EMISSION cleanup + artifact announcement + append-lock diagnostics + telemetry recovery + docs".

Closeout (`closeout/`): the reviewer's REVIEW HOLD of 2026-10-09 (four points: the emit contract after an effect,
`workflow.submitted` before the result, the same-pid lock, the recovery race) → round 1
(`closeout/round-1/EL2-CLOSEOUT-4-POINTS.md`) → limited GO (A1; the node's rejection told apart from an unknown
outcome; a fail-closed recovery lock; the intent event deferred) → round 2 (`closeout/round-2/EL2-FINAL-CLOSEOUT.md`)
→ GO conditioned on one runtime regression of the JSON contract (3/3) → the final full gate of 2026-10-10 (§7).
Sections 2b, 3, 4, 7 and 8 below carry the closeout; where a closeout decision supersedes an earlier line of §2, the
earlier line is kept as written and the superseding one is in 2b.

## 1 · The promise and the defect (from the investigation)

- `packages/core/README.md` §3: "`events.jsonl` is the source of truth for the workspace"; `attachLedgerAppender`:
  "guarantees that all formal EventEnvelopes are persisted".
- Runtime on rc.27 (`before/probes/probes-1.results.json`): a `tx send` with an append lock left by a dead holder took
  **102 s, exit 0, `ok:true`, 0 of 10 events, the lock still there**; `lock list` said the holder was alive;
  `lock doctor` said "All 1 active lock(s) are held by live processes"; a dead telemetry lock cost 8 s per command.
- Causes: C1 no owner check on `append-<file>.lock` (`{pid, time}` written, never read, 10 s spin then throw); C2 every
  append error swallowed by `attachLedgerAppender` and every listener error by `CoreEventBus.emit`; C3 thirteen raw
  `normalizeAndEmit({kind: …})` sites silently discarded (kinds not in the catalog, no correlation); C4 `tx plan` /
  `tx sign --out` wrote with `writeArtifact` and recorded nothing; C5 the lock tools treated a record without
  `hostname` as remote, hence alive; C7 telemetry on the same coordinator; C8 the README described a flow the code
  never had.
- One more silent loss found while implementing: the shortcut `tx send`'s `workflow.plan.created` carries a bigint
  (`amountSompi`), `JSON.stringify` threw, the appender swallowed it: **no `workflow.plan.created` was ever in a
  ledger** (the BEFORE reference run shows 10 lines: started, 7 × artifact.written, signed, receipt).

## 2 · Decisions (reviewer, 2026-10-07) and how each was implemented

| Decision | Verdict | Implementation |
| --- | --- | --- |
| D1 dead/corrupt lock | GO, safe recovery | `core/src/append-coordinator.ts`: the lock record is the workspace lock shape (`hardkas.lock.v1`, name, pid, command, cwd, **hostname**, createdAt); `judgeAppendLock` decides before anything is touched: live (pid runs here, or empty/unreadable within the 2 s creation grace) → wait, never taken over; unverifiable (another host) → wait; abandoned (dead pid here; empty/unreadable past the grace; a legacy record without hostname whose pid is dead here and ≥ 60 s old) → `recoverAbandonedLock`: one `.recover` mutex (`wx`, a stale one cleared after 10 s), re-read, byte-exact compare, unlink. The 10 s wait is unchanged; past it a typed `APPEND_LOCK_TIMEOUT` names the holder. A recovery logs a `STALE_LOCK_RECOVERY` anomaly after the lock is released. |
| D2 event cannot be persisted | (a) typed failure, no spool | `core/src/events.ts`: the ledger is a **persistence sink** (`coreEvents.persistWith`), not a listener; `emit` hands the envelope to the sinks first and a sink's failure propagates as `EVENT_LEDGER_APPEND_FAILED` (`EventLedgerAppendError`: `ledgerPath`, `event` {kind, eventId, workflowId, txId?, artifactId?, path?}, `metadata.cause`). Listeners stay fire-and-forget. An event counts as seen only once persisted (a failed one can be re-emitted). The message keeps "the evidence was not persisted" apart from "the effect may already have taken place" and names what is known (artifact id + path: "WAS written at"; txId: "may already have been executed or submitted … `hardkas tx status <txId>`"), never a success. `sdk/src/tx.ts` `send()`: the submission intent is recorded before the broadcast; if that fails the error adds "Nothing was broadcast". |
| D3 raw emissions | (c) mixed, never invent a correlation | Converted (real identity + the artifact's own workflowId): `send()`'s `workflow.submitted` → a catalog envelope {txId, rpcUrl without credentials} under the signed artifact's workflowId; `simulate()`'s receipt `artifact.created` → `artifact.written` (content hash, receipt path, the receipt's workflowId); the scenario bridge's `artifact.created` → `artifact.written`. Removed as false emissions: `tx.signed` ×2 and `artifact.created` ×2 after `sdk.artifacts.write` (the manager already announces that write), `simulate()`'s `workflow.submitted` to `"simulated://local"` and `tx.submitted`, kaspa-rpc's `rpc.health` ×2 / `rpc.error` (transport diagnostics without correlation, not workspace evidence), tx-plan-runner's `workflow.plan.created` (the workflow owner, tx-flow, emits the formal one; a standalone `tx plan` announces its artifact under the plan's workflowId). `normalizeAndEmit` refuses anything that is not an envelope with `EVENT_ENVELOPE_INVALID`. Guard: `core/test/event-emission-guard.test.ts` (no `normalizeAndEmit(` call and no `coreEvents.emit({` literal in any package source). The guard found a 14th site the investigation had not listed: the dev-server watcher put a fake `artifact.written` envelope (`{kind, payload: <the whole artifact>} as any`, no identity) on the core bus so its SSE route could forward it — with a ledger attached that would now be recorded as a formal event. It is a dev-server notification, not an event: it now travels on the dev-server's own `artifactFileNotices` (`dev-server/src/stream.ts`) and the `/artifacts/stream` route forwards both real `artifact.written` envelopes and those notices with the same stream envelope as before. |
| D4 artifact announcement | GO, one boundary | `emitArtifactWritten` in core builds and emits the one `artifact.written` envelope (identity = content hash; correlation = caller's, else the artifact's own `workflowId`, else `wf_unknown_standalone`). Used by the SDK artifact manager (same event as before, plus the artifact's workflowId when the caller gave none), `tx plan` (`--out` copy and the `.hardkas/artifacts` copy), `tx sign --out`, `simulate()`'s receipt, the scenario bridge. `writeArtifact` now returns the absolute path written. |
| D5 simulate-reorg | OUT → SIMULATOR-STATE-TRUST-1 | EL2-I3 kept as historical evidence only (`before/tests/cli-event-ledger-2.test.ts`); removed from the closure test. |
| D6 telemetry | D1 recovery, still best effort | Same coordinator, so a dead telemetry lock is recovered without the wait; `logAnomaly` keeps swallowing. |
| D7 lock diagnostics | GO for append locks | With the new record `listLocks` / `lock doctor` / `lock clear --if-dead` work unchanged on append locks. `cli/src/commands/lock.ts` adds `liveness` (`live` / `stale` / `unverifiable` + `detail`) to `lock list --json`, `status` and `doctor`: a record without hostname or on another host is "unverifiable", never "live". `core/src/lock.ts` untouched. |
| D8 SDK auto-ledger | NO | untouched |
| D9 README | update | `packages/core/README.md` §3 rewritten to the real flow (lock name and record, judgement, wait, failure code, anomaly, raw events). |

Property EL2-I0 — HardKAS never reports a clean success after silently losing a formal event that had to persist —
holds by construction: with a ledger attached, `emit` either persisted the envelope or threw.

### 2b · Closeout decisions (reviewer, 2026-10-09 hold → 2026-10-10 GO) and how each was implemented

| Point | Verdict | Implementation |
| --- | --- | --- |
| CL-1 emit contract after an effect | **A1**: keep the typed throw; name the effect at every execution / broadcast boundary; tx-flow keeps the code and the partial result; no broad API change (B — a never-throwing bus with deferred failure — rejected) | `core/src/events.ts`: `LedgerFailureEffect` {operation: broadcast \| simulated-execution; outcome: accepted \| rejected \| unknown \| executed \| not-performed; txId?, artifactId?, artifactPath?}, `EventLedgerAppendError.effect` (+ `metadata.effect`), `rethrowWithLedgerEffect(e, effect)` (same code, same lost event, same cause; an effect named closer to the boundary is kept; a non-ledger error passes untouched). The message leads with the effect: "The node ACCEPTED the submission of transaction X (acceptance of the request by the RPC, not acceptance or confirmation in the DAG): it WAS sent … Do not send it again" / "The node REJECTED transaction X with an explicit answer" / "The outcome of sending transaction X is UNKNOWN: the submit call failed without an answer from the node, which may have received it" / "The simulator EXECUTED transaction X: the simulated state changed … Do not execute it again" / "Nothing was sent (executed): the ledger failed before …". Boundaries: `sdk.tx.send` (`onBeforeTxSend` → not-performed; the submission write, the result event and `onTxSent` → the recorded outcome), `sdk.tx.simulate` (the plan and the execution material → not-performed; the receipt announcement after the commit → executed), `sdk.workflow` (the four writes after send / simulate, `effectOf(result)`), CLI `tx-flow` (`workflow.started` and the plan / sign announcements → not-performed; after the send → the send result's effect; inside the send → only the effect the SDK named, never assumed; the error now lands on the step where it happened, with `TxFlowStepResult.code` / `.effect` and the step's artifact kept), CLI `tx send` (both modes: a ledger failure that stops the command writes the one JSON with `outcome` = `outcomeOfEffect(effect)` and `effect`; the shortcut mode's step report keeps code, effect and `data`, and never says "did not broadcast" once the send ran). |
| CL-2 submission semantics | `workflow.submitted` only for a submission the node accepted; the node's rejection told apart from a call that failed **without an answer** (a timeout, a lost connection), which is never presented as a rejection; existing kinds and states only; the intent kind `workflow.submission.requested` deferred | `artifacts/src/tx-status.ts`: `submitOutcomeOf(submitResult)` → `accepted` (RPC acceptance of the request, not DAG acceptance) \| `rejected` (`accepted:false` without error, or the node's own `Rejected transaction <txId>: …` — rusty-kaspa's RejectedTransaction, as `fixtures/toccata-v2/silver/*/evidence.json` record it) \| `unknown` (anything else); `deriveTxStatus` gives **`INSUFFICIENT_EVIDENCE`** for an unknown outcome ("whether the node received this transaction is unknown … observe it"), `REJECTED_BY_NODE` stays for a rejection — the definition Wave 2(a) Q4 ratified. `sdk/src/tx.ts` `send()`: the pre-broadcast `workflow.submitted` is gone; after the call returned or failed and the submission is written: accepted → `workflow.submitted` {txId, rpcUrl}; rejected → `workflow.failed` ("the node rejected the submission: …"); unknown → **`rpc.error`** ({endpoint, error "… the outcome of the submission is unknown, and the node may have received transaction …", retriable:false}) — all under the signed artifact's own workflowId, naming the submission artifact. `sdk/src/workflow.ts`: `TX_SUBMISSION_OUTCOME_UNKNOWN` (not `TX_SUBMISSION_REJECTED`) for an unknown outcome. CLI: `sendOutcomeLabel` → `outcome: "unknown"` beside AUX-11's `submitted` / `rejected`; `notAcceptedFailure` → `TX_SUBMISSION_OUTCOME_UNKNOWN` ("Submission outcome UNKNOWN: the node may have received the transaction … check it ('hardkas tx status <txId>') before sending it again"); tx-flow emits no `workflow.receipt failed` for an unknown outcome (it would read as a rejection); `why` narrates the three cases ("accepted the submission request … not acceptance or confirmation in the DAG"); `tx batch` / `dev tx generate` report `sendOutcomeUnknown: true` instead of `sendRejected`. |
| CL-3 same-pid lock | a record naming this process's pid is held by a live process (another flow of it: a worker thread shares the pid); waited for, never taken over; the cost (one 10 s wait on a leftover of an earlier process with the same pid, then a typed failure, recovered by the next process) accepted | `judgeAppendLock`: `pid === process.pid` → `live` ("held by this process, through another of its flows"); the EL-2 test that expected `abandoned` inverted. |
| CL-4 recovery race | a recovery that is still valid is never taken over; read / compare / unlink is not atomic, so an **abandoned** recovery lock is not removed automatically either: **fail closed**, typed, administrative clearing; the automatic recovery of an ordinary abandoned append lock kept | `recoverAbandonedLock`: the recovery lock is `.hardkas/locks/append-<file>.recover.lock` (a workspace lock `lock list` / `lock doctor` show; the first round kept it at `<lock>.recover`), taken with `wx` and carrying its recoverer's record; an existing one is judged by `judgeAppendLock`: live / unverifiable / own pid → the append waits (`APPEND_LOCK_TIMEOUT` names "a recovery of it is in progress"); gone → retry; **abandoned → `APPEND_LOCK_RECOVERY_BLOCKED` at once** ("HardKAS never removes a recovery lock by itself, because removing it could race with another recoverer … run 'hardkas lock clear append-<file>.recover --if-dead'" — or `--force` for an empty one that names no process), wrapped in `EVENT_LEDGER_APPEND_FAILED` when it comes from the ledger. `removeIfUnchanged` only releases the recovery lock this call wrote. `APPEND_RECOVER_MUTEX_STALE_MS` (the 10 s age-based clearing of §2 D1, introduced by this wave and never published) removed. |
| CL-5 intent event | deferred: no new event kinds in this closeout | nothing added; the proposal (`workflow.submission.requested` {txId, signedArtifactId, rpcUrl} before the broadcast, to restore "evidence before broadcast") stays in `closeout/round-1/EL2-CLOSEOUT-4-POINTS.md`. |

Supersessions of §2 by 2b: D1's "`.recover` mutex (`wx`, a stale one cleared after 10 s)" → CL-4; D2's "`send()`: the
submission intent is recorded before the broadcast; if that fails the error adds 'Nothing was broadcast'" → CL-2 and
CL-1; D3's "`send()`'s `workflow.submitted` → a catalog envelope … under the signed artifact's workflowId" → CL-2 (the
same envelope, emitted after the call answered and only for an accepted submission).

Invariants added by the closeout: **CL-I1** a broadcast or an execution that took place is never described as an
operation that did not happen (every ledger failure after an effect names it); **CL-I2** no `workflow.submitted`
without an accepted submission, no rejection claimed without the node's answer; **CL-I3** a lock whose holder may be
alive is never taken over, even when the pid is this process's; **CL-I4** a recovery whose recoverer may be alive is
never taken over, and no recovery lock is ever removed automatically; **CL-I5** `tx send --json` under a ledger failure
writes exactly one JSON document, exit 1, with the code, the outcome of what the send had done and the txId when there
is one (proven at process level, §7 `fc-json-2`).

## 3 · Files changed

Product:
- `packages/core/src/append-coordinator.ts` (D1, D6, D7 record; constants `APPEND_LOCK_WAIT_MS` 10 000,
  `APPEND_LOCK_CREATION_GRACE_MS` 2 000, `LEGACY_APPEND_LOCK_MIN_AGE_MS` 60 000, `APPEND_RECOVER_MUTEX_STALE_MS` 10 000;
  `appendLockRecord`, `judgeAppendLock`, `AppendLockVerdict`; `commandOfArgv` / `processIsAlive` are local copies of
  lock.ts's rules so that lock.ts is neither touched nor imported (it imports the core barrel: a module cycle));
- `packages/core/src/events.ts` (D2, D3, D4: `persistWith`, `persists`, strict `normalizeAndEmit`, `removeAll` clears
  sinks too, `emitArtifactWritten`, `STANDALONE_WORKFLOW_ID`, `EventLedgerAppendError`, `isEventLedgerAppendFailure`,
  `serializeEventForLedger` (bigint → decimal string), `attachLedgerAppender` as a sink);
- `packages/core/README.md` §3 (D9);
- `packages/sdk/src/artifacts-manager.ts` (D4 boundary), `packages/sdk/src/tx.ts` (D3 conversions and removals, D4
  receipt announcement, the pre-broadcast failure message);
- `packages/artifacts/src/io.ts` (`writeArtifact` returns the path);
- `packages/cli/src/commands/tx.ts` (D4 announcements), `packages/cli/src/runners/tx-plan-runner.ts` (D3 removal),
  `packages/cli/src/commands/lock.ts` (D7);
- `packages/kaspa-rpc/src/json-rpc-client.ts` (D3 removals), `packages/testing/src/scenarios.ts` (D3/D4);
- `packages/dev-server/src/{stream,watcher,routes/stream}.ts` (D3: the watcher's fake envelope becomes a dev-server
  notice; the SSE stream contract is unchanged).

Tests:
- `packages/core/test/event-ledger-2.test.ts` (the BEFORE blocks unchanged + AFTER: judgement matrix, record shape and
  `listLocks`, recovery anomaly, stale `.recover`, telemetry recovery, typed failure on an unwritable ledger with the
  two facts and no spool, txId naming, retry after failure, listener isolation, live holder → typed failure in ≈10 s
  with the holder's lock intact, bigint payload, the artifact boundary);
- `packages/core/test/event-emission-guard.test.ts` (static + runtime guard);
- `packages/cli/test/event-ledger-2.test.ts` (control; EL2-I1 without the wait; EL2-I2 typed failure + no takeover;
  EL2-I4 plan and sign --out; D7 stale / unverifiable; D6 telemetry; EL2-I3 removed).

Closeout (rounds 1 and 2, §2b), product:
- `packages/core/src/events.ts` (CL-1: `LedgerFailureEffect`, `rethrowWithLedgerEffect`, `EventLedgerAppendError.effect`,
  the effect-first message), `packages/core/src/append-coordinator.ts` (CL-3 own pid = live; CL-4 recovery lock
  `append-<file>.recover.lock`, `APPEND_LOCK_RECOVERY_BLOCKED`, `removeIfUnchanged` only for what this call wrote,
  `APPEND_RECOVER_MUTEX_STALE_MS` removed), `packages/core/README.md` §3 (the recovery lock; the effect in a ledger
  failure);
- `packages/artifacts/src/tx-status.ts` (CL-2: `SubmitOutcome`, `submitOutcomeOf`; `INSUFFICIENT_EVIDENCE` for an
  unknown outcome);
- `packages/sdk/src/tx.ts` (CL-2 result events after the call answered: submitted / failed / rpc.error; CL-1 boundaries
  in `send()` and `simulate()`), `packages/sdk/src/workflow.ts` (`TX_SUBMISSION_OUTCOME_UNKNOWN`; CL-1 `effectOf` on
  the writes after send / simulate);
- `packages/cli/src/runners/tx-flow.ts` (CL-1: `code` / `effect` on the step result, the error on the step where it
  happened, the send result kept; CL-2: no `workflow.receipt failed` for an unknown outcome),
  `packages/cli/src/runners/next-steps.ts` (`sendOutcomeLabel`, `notAcceptedFailure`, `outcomeOfEffect`,
  `effectSummary`), `packages/cli/src/commands/tx.ts` (`rethrowSendLedgerFailure`: the one JSON with outcome + effect;
  the shortcut mode's ledger-failure report; `outcome: "unknown"`; `TX_SUBMISSION_OUTCOME_UNKNOWN`),
  `packages/cli/src/runners/why-narrative.ts` (the three narrations), `packages/cli/src/runners/tx-batch-runner.ts` and
  `dev-tx-generate-runner.ts` (`sendOutcomeUnknown`).

Closeout, tests:
- new: `packages/core/test/event-ledger-2-closeout.test.ts` (CL-3 worker thread; CL-4a live recoverer; CL-4b recoverer
  suspended between check and unlink vs a later holder; CL-4c abandoned recovery lock fails closed, `lock clear
  --if-dead`, then automatic recovery), `packages/core/test/event-ledger-2-effect.test.ts` (`rethrowWithLedgerEffect`),
  `packages/artifacts/test/event-ledger-2-submit-outcome.test.ts` (`deriveTxStatus` per submit outcome),
  `packages/sdk/test/event-ledger-2-effect.test.ts` (seven boundaries: accepted ×2, unknown, rejected, executed,
  not-performed, a workflow's tx.simulate), `packages/cli/test/event-ledger-2-flow.test.ts` (tx-flow: not-performed
  before the send, the effect after it, no assumed effect inside the send, no `receipt failed` for unknown; `why`),
  `packages/cli/test/event-ledger-2-report.test.ts` (`sendOutcomeLabel` / `notAcceptedFailure` / `outcomeOfEffect`),
  `packages/cli/test/event-ledger-2-json-contract.test.ts` (CL-I5 at process level: three cases, §7 `fc-json-2`);
- changed: `packages/sdk/test/event-ledger-2-submission.test.ts` (CL-2: + unknown outcome ×2, + workflow code),
  `packages/core/test/event-ledger-2.test.ts` (own pid → `live`; the empty `.recover` test inverted to fail-closed),
  `packages/cli/test/demo-cut-t-a14b-tx-status.test.ts` and `packages/cli/test/wave1-3-cli-helpers.test.ts` (the node's
  rejection in its real wire format; same assertions, green before and after).

## 4 · Public surface

No signature removed or changed: `coreEvents.on/emit/normalizeAndEmit/removeAll` and `attachLedgerAppender` keep
their types; `emit` stays synchronous. Additions: `coreEvents.persistWith`, `coreEvents.persists`,
`emitArtifactWritten`, `STANDALONE_WORKFLOW_ID`, `EventLedgerAppendError`, `isEventLedgerAppendFailure`,
`serializeEventForLedger`, `appendLockRecord`, `judgeAppendLock` and the four coordinator constants;
`writeArtifact(): Promise<string>` (was `Promise<void>`); `lock list --json` items gain `liveness` and `detail`.
Behaviour change to flag to the reviewer (the STOP condition was "a general change of emit's synchronous semantics"):
`emit` now THROWS `EVENT_LEDGER_APPEND_FAILED` when an attached ledger cannot persist the envelope — only then, only
that — and a listener's own exception is still swallowed. Without a ledger attached (the SDK as a library) nothing
changed.

Closeout additions (all additive and narrow): core `LedgerFailureEffect`, `rethrowWithLedgerEffect`,
`EventLedgerAppendError.effect` / `metadata.effect`, the error code `APPEND_LOCK_RECOVERY_BLOCKED`, the recovery lock
`append-<file>.recover.lock`; artifacts `SubmitOutcome`, `submitOutcomeOf`, and `deriveTxStatus` answering
`INSUFFICIENT_EVIDENCE` (an existing state) for a submission whose call failed without an answer; SDK: `rpc.error`
(an existing kind) instead of `workflow.failed` for that case, and the workflow code `TX_SUBMISSION_OUTCOME_UNKNOWN`;
CLI: `outcome: "unknown"` beside AUX-11's `submitted` / `rejected` / `not_executed` / `failed`, the code
`TX_SUBMISSION_OUTCOME_UNKNOWN`, the failure envelope of a `tx send` whose ledger failed (`outcome`, `effect`, `data`),
`TxFlowStepResult.code` / `.effect`, `sendOutcomeUnknown` in `tx batch` / `dev tx generate`. One removal:
`APPEND_RECOVER_MUTEX_STALE_MS`, introduced by this wave on 2026-10-09 and never published. No new event kinds, no new
consensus state.

## 5 · Out of scope, left as found

- `dag simulate-reorg` records nothing (SIMULATOR-STATE-TRUST-1; EL2-I3 in `before/tests`).
- The SDK as a library attaches no ledger (D8).
- `core/src/lock.ts` (TOCTOU between read and unlink, pid-only liveness): untouched.
- The trace and the state snapshot a simulated execution publishes, and the direct `writeArtifact` writers of
  l2/bridge/silver runners and `observe`, are not announced: ARTIFACT-ANNOUNCE-2 (§9).
- `lock doctor --json` does not exist (CLI-CONTRACT-2); `lock doctor` exits 0 with stale locks (DOCTOR-EXIT-CONTRACT-1).
- The core README §2 (workspace locks) still describes a 30 s spin and `HARDKAS_LOCK_CONTENTION` that lock.ts does not
  have (its grace is 2 s and its codes LOCK_HELD/LOCK_TIMEOUT): the general lock's docs, not this wave's.
- `apps/docs` does not build in hk-ra (a docusaurus module missing from that worktree's node_modules); the packages
  were built with `turbo build --filter=./packages/*`.

## 6 · AFTER · runtime reproduction (P1 and the live holder)

The investigation's own probes (`before/probes/el2-probes.mjs`, unchanged) re-run against the rebuilt hk-ra under the
same hermetic harness (`after/probes/run-probes.ps1`; 0 non-loopback connections in every run), plus three new ones
(`after/probes/el2-after-extra.mjs`). Results: `after/probes/after-1-p.results.json`, `after-1-x.results.json`,
`after-2-x.results.json`; the comparison printed by `after/probes/compare-probes.mjs`.

| Probe | BEFORE (rc.27 content, 2026-10-07) | AFTER (2026-10-09) |
| --- | --- | --- |
| **P1** a shortcut `tx send` with an append lock left by a dead holder | reference send 3.3 s, 10 ledger lines; with the lock: **102.4 s, exit 0, `ok:true`, 10 → 10 events, the lock still there**; the next `tx plan`: 1.9 s, still 10 lines | reference send 1.3 s, 12 lines; with the lock: **1.2 s, exit 0, 12 → 24 events, the lock gone**; the next `tx plan`: 1.0 s, 26 lines |
| **P2** what the lock tools say about that (legacy `{pid, time}`) lock | `lock list --json`: `isAlive: true`, "State: live"; `lock doctor`: "All 1 active lock(s) are held by live processes" | `lock list --json`: `liveness: "unverifiable"`, detail "no hostname recorded (a lock written by an earlier HardKAS): its process cannot be placed on a host" (the core `isAlive: true` is still printed, now next to what it is worth); human "State: UNVERIFIABLE" + Why |
| **P3** a dead telemetry lock + a dead artifacts lock, then `tx plan` | reference plan 3.9 s → **11.9 s** with the locks; the telemetry lock still there | 1.0 s → **1.1 s**; the telemetry lock gone (its recovery and the artifacts lock's are in `telemetry.jsonl`: CLI test D6) |
| **P4** kinds after plan → sign → send, then a shortcut send | 2 × `artifact.written`; the shortcut adds started / 7 × artifact.written / signed / receipt (no `workflow.plan.created`: lost to the bigint) | **6 × `artifact.written`** (plan: `--out` copy + `.hardkas/artifacts` copy by `cli:tx-plan`, store copy by the manager; signed: store copy + `--out` copy by `cli:tx-sign`; receipt: store copy by `sdk:tx-simulate`), all under the plan's own workflowId; the shortcut adds started / **`workflow.plan.created`** / 8 × artifact.written / signed / receipt |
| **A6** a LIVE holder of the events lock for the whole command | (the CLI EL2-I2 BEFORE: exit 0 in 101.3 s, silent) | **exit 1 in 11.2 s, `EVENT_LEDGER_APPEND_FAILED`**, the holder's lock byte for byte intact, ledger 0 → 0; the message names `workflow.started`, the ledger path and the holder's pid |
| **A7** the coordinator's own record of a dead holder | (no such record existed) | `lock list --json`: `liveness: "stale"`, `isAlive: false`, host = this host; `lock doctor`: "✗ Stale lock found: append-events.jsonl (PID: …; process … is not running on this host)" and "1 lock(s): 0 live, 1 stale, 0 unverifiable"; a legacy telemetry lock beside it: unverifiable; the next `tx plan` (1.5 s) recovers both; `lock list` afterwards: `[]` |
| **A8** plan → sign --out → send: what is announced | (plan and sign announced nothing: CLI EL2-I4 BEFORE) | plan ×3, signed ×2, receipt ×1, every one under the plan's workflowId `wf_c5e0…`; the trace and the state snapshot of the same execution are not announced (ARTIFACT-ANNOUNCE-2) |

The reviewer's P1 condition — before: 102 s / exit 0 / 0 of 10 events / stale lock remains; after: dead lock recovered,
no ~100 s wait, the events persist, no lock left; live holder: no takeover — holds on both sides.

## 7 · Tests and gates

Hermetic runner (`after/logs/run-files-wt.ps1`: `scripts/gate-hermetic.mjs --home %TEMP%\hk-v210-gate-home`, Docker
unreachable, no non-loopback network; every run kept under `after/logs/<tag>.{log,json,exit,head,status}`).

| Run | Files | Result |
| --- | --- | --- |
| `core-1` | the two EL2 core files + events, append-safety, append-tail-safety, fault-injection, abuse-multiprocess, lock, lock-reentrancy, append-lint | 64/65: every EL2 test green (the live holder → typed failure in 15.1 s with its lock intact; the dead lock recovered in ≈100 ms); the one red was the new static guard finding the dev-server watcher's fake envelope (`dev-server/src/watcher.ts:116`), fixed as §2 D3 says |
| `guard-1` | event-emission-guard + dev-server watcher tests | 6/6 after the conversion |
| `cli-1` | cli event-ledger-2 + cli-runtime-contract, batch-exit-status, sdk workflow-determinism, localnet replay-trust-2, cli workspace-authority-1 | 72/74: control, EL2-I1 (**1.2 s** against 101.5 s before; recovery recorded), EL2-I2 (**exit 1, `EVENT_LEDGER_APPEND_FAILED`, holder's lock intact, 11.4 s** against exit 0 in 101.3 s before), EL2-I4 ×2, D7 unverifiable all green. The two reds were mine: D7-stale ran while a turbo build I had started in parallel was cleaning `packages/core/dist` (the spawned CLI died at once: empty stdout in 340 ms), and D6 expected the word "artifacts" in lock.ts's anomaly, which names the pid only |
| `cli-2` | cli event-ledger-2 `-t "D7\|D6"`, nothing else running | 3/3 green |
| `el2-after-1` | the two EL2 core files + cli event-ledger-2 (final tree, run by the session that took the wave over) | **30/30**: core 19, guard 3, cli 8 — EL2-I1 **1.16 s**, live holder → typed failure in 15.1 s (core) / `EVENT_LEDGER_APPEND_FAILED` with the holder's lock intact (cli), D6 and D7 green; 0 non-loopback |
| `el2-related-1` | the whole test suites of core, artifacts, sdk, kaspa-rpc, testing, dev-server + cli `lock*`, `tx*`, `event*`, `r0b*`, `containment-2*` | **1306 passed, 0 failed, 19 skipped** (204 files, 391 s); 0 non-loopback |
| full gate `el2-gate-1` | everything (`after/logs/run-full-wt.cut46.ps1`) | **PASS: 2749 tests, 2721 passed, 0 failed, 28 skipped** (436 files + 7 skipped, 1283 s); 0 non-loopback; `C:\.hardkas` absent before and after. Against develop's 2719 / 2691 / 0 / 28: +30 tests = exactly this wave's (core 19 + guard 3 + cli 8) |

Test side effect (pre-existing, not this wave): running the artifacts suite rewrites
`packages/artifacts/test/adversarial/__snapshots__/wave1-1-canonical-v5.test.ts.snap` with LF line endings (content
identical: `git diff --ignore-cr-at-eol` is empty). It was restored to HEAD after each run and is not part of the wave.

### 7b · Closeout runs (`closeout/logs/<tag>.{log,json,exit,head,status}`; the same hermetic runner; 0 non-loopback in every run)

Round 1 (the four points; code and tests of the closeout, on the tree `ac80a9a8` gated above):

| Run | Result |
| --- | --- |
| `cl-before-1` | **6/6 red**, each for the reason the reviewer named: CL-3 the worker thread's lock taken over; CL-4a a live recoverer's mutex removed for being "old"; CL-4b the suspended recoverer deleted the lock of the holder that came after it; CL-2 ×3 `workflow.submitted` before, or without, an accepted submission |
| `build-closeout-1` | 24/24 tasks |
| `cl-after-1` | **39/39**: core EL2 19, CLI EL2 8, closeout 3, SDK rejected-send 3, submission 3, guard 3 |

Round 2 (A1, rejection vs unknown, fail-closed recovery lock; on the round-1 tree `b5e9fde9`):

| Run | Result |
| --- | --- |
| `fc-before-1` | **19 red / 45 green controls**, each red for the intended reason: the effect missing (7 SDK); an unknown outcome presented as a rejection (3 SDK, 1 artifacts, 1 tx-flow `workflow.receipt failed`, 1 `why`); `why` calling RPC acceptance plain "accepted" (1); tx-flow losing the code / effect / partial result and attributing the failure to the wrong step (3); an abandoned recovery lock removed automatically (2) |
| `build-final-after-1` | failed: a TS2677 of my own in `sdk/src/tx.ts` (kept; fixed) · `build-final-after-2` 24/24 |
| `fc-after-1` | **81/81** |
| `fc-related-1` | 80 passed / 0 failed / 5 skipped (the pre-existing `describe.skip` of `workflow-corpus.test.ts`) |
| `fc-related-2` | 218 passed / 0 failed / 1 skipped (`localnet-fund-race` needs a real localnet): durable simulator (SDK + CLI), json-papercuts, narratives, R0 / R0B lifecycle, SURFACE-TRUTH, EVIDENCE-TRUST, REPLAY-TRUST-2, WORKSPACE-AUTHORITY, deploy containment |
| hardening after `fc-after-1` | tx-flow no longer assumes "not sent" when the ledger fails inside the send without a named effect; the shortcut mode's JSON carries `outcome` / `effect` when the ledger fails at the start |
| `fc-before-2` | supplemental, `tx-flow.ts` from `b5e9fde9`: the 5 flow tests red (the new one: the code lost) |
| `build-final-after-3` | 24/24 |
| `fc-after-2` | **106/106**: everything EL-2 + `tx-flow-outcome`, AUX-11 (`wave2-e-send-outcome`), the forbidden narratives (`demo-cut-t-a14b-no-false-claims`), json-papercuts, the CLI EL-2 test |
| `fc-after-3` | 13/13: the three files whose fixtures use `HARDKAS_VERSION` instead of a literal version |

The reviewer's final check (CL-I5, `packages/cli/test/event-ledger-2-json-contract.test.ts`: the built CLI, a
simulated workspace, a live process holding the append lock of `events.jsonl` for the whole command):

| Run | Result |
| --- | --- |
| `fc-json-1` | 1/2 red — **not a product defect, not a double emission** (one JSON was written): the premise of the "after the effect" case was wrong. With a plan made by `tx plan --out`, the simulator publishes the plan into its canonical store entry before the commit (`persistExecutionMaterial`; the CLI's copy is `<timestamp>-<planId>.plan.json`, not that entry), so the failing event came before the effect, and the product said so truthfully: `outcome: failed`, `effect.outcome: not-performed`, "Nothing was executed … the artifact … WAS written at …/plans/txPlan-….json". Kept; the case is now case 2 below, and the papercut is `PLAN-STORE-ENTRY-1` (§9) |
| `fc-json-2` | **3/3**, exactly one JSON document on stdout each (the whole stdout parses; one chunk), exit 1, `code: EVENT_LEDGER_APPEND_FAILED`, 0 events recorded, the holder's lock intact: **1** before anything is sent (shortcut mode, `workflow.started` fails) → `outcome: failed`, `effect` simulated-execution / not-performed, no txId (nothing was planned); **2** before the effect, after an artifact write (CLI-made plan and signed) → `failed` / `not-performed`, `effect.txId` = the signed artifact's synthetic txId, the plan copy that WAS written named, no receipt published; **3** after a known effect (SDK-made plan and signed at their canonical entries; the simulator committed; the receipt's announcement fails) → **`outcome: submitted`**, `effect` executed with the txId, `artifactId` = the published receipt's contentHash and `artifactPath` = its store path, "The simulator EXECUTED transaction …: the simulated state changed … Do not execute it again", exactly one receipt published |

No product change was made for that check: the double emission is prevented by construction (`getOutput()` is one
instance per process; `handleError` writes its envelope only while `jsonWritten` is false) and is now proven at
process level. The accepted-broadcast variant at process level would need a fake node on loopback; it is covered
in-process by `sdk/test/event-ledger-2-effect.test.ts`.

The final full gate (the reviewer's GO after `fc-json-2`; `closeout/scripts/run-full-wt.ps1`, detached):

| Run | Files | Result |
| --- | --- | --- |
| `fc-gate-1` | everything, on the final tree (§8) | **PASS: 2785 tests, 2757 passed, 0 failed, 28 skipped** (444 files + 7 skipped, 1406 s); 0 non-loopback; `C:\.hardkas` absent before and after. Against `el2-gate-1`'s 2749 / 2721 / 0 / 28: **+36 tests = exactly the closeout's** (core closeout 4, core effect 3, artifacts 3, SDK effect 7, SDK submission 6, CLI flow 7, CLI report 3, CLI json-contract 3). Against develop's 2719 / 2691 / 0 / 28: +66 = the wave's 30 + the closeout's 36. The only side effect was the pre-existing LF rewrite of the wave1-1 snapshot (content identical: `git diff --ignore-cr-at-eol` empty), restored before the manifest. |

## 8 · Manifest and tree

Computed from a temporary index (the worktree's own index is never touched), base **`71ff614f9`** (develop = main
content = tag `v0.12.0-rc.27`, tree `ec67d31c`). This ledger cannot hold the hash of a tree that contains itself, so it
records the tree of the wave's **code and tests without this evidence folder**; the full tree (code + tests + this
folder, with its `MANIFEST.sha256`) is reported with the hand-over.

Two states are recorded: the wave as gated on 2026-10-09 (`el2-gate-1`; the tree the reviewer's hold was raised on),
and the final state after the closeout (`fc-gate-1`, 2026-10-10), which is the one the owner's commit must reproduce.

**Code tree after the wave, before the closeout (2026-10-09): `7bbfdc131b8faf45f1c2a97444eea820e22a9848`** — 17 paths
(14 modified, 3 added), +1587 / −280 (its full tree, with the evidence folder of that day, was `ac80a9a8`; the round-1
closeout's full tree, `b5e9fde9`, is the base of the round-2 patch in `closeout/round-2/`):

| Blob | Path |
| --- | --- |
| `6875c5e5` | M `packages/artifacts/src/io.ts` |
| `c98f6cfd` | M `packages/cli/src/commands/lock.ts` |
| `3e1d131a` | M `packages/cli/src/commands/tx.ts` |
| `d3bb2d0c` | M `packages/cli/src/runners/tx-plan-runner.ts` |
| `197a7ba2` | A `packages/cli/test/event-ledger-2.test.ts` |
| `27028bc0` | M `packages/core/README.md` |
| `97fbcd07` | M `packages/core/src/append-coordinator.ts` |
| `758ca4d5` | M `packages/core/src/events.ts` |
| `be66b199` | A `packages/core/test/event-emission-guard.test.ts` |
| `4eedb0c0` | A `packages/core/test/event-ledger-2.test.ts` |
| `949e949d` | M `packages/dev-server/src/routes/stream.ts` |
| `76453a86` | M `packages/dev-server/src/stream.ts` |
| `100140ea` | M `packages/dev-server/src/watcher.ts` |
| `df02ca72` | M `packages/kaspa-rpc/src/json-rpc-client.ts` |
| `8bc2ca60` | M `packages/sdk/src/artifacts-manager.ts` |
| `d1efaa1c` | M `packages/sdk/src/tx.ts` |
| `865f4214` | M `packages/testing/src/scenarios.ts` |

**Final code tree (2026-10-10, the tree `fc-gate-1` ran on): `68fc258506aa04aeefbf1abb6a39885f88179d99`** — 34 paths
(21 modified, 13 added), +3312 / −371 against base `71ff614f9` (`closeout/scripts/manifest2.ps1 -Mode code`, tag `m3`):

| Blob | Path |
| --- | --- |
| `6875c5e5` | M `packages/artifacts/src/io.ts` |
| `4931ffef` | M `packages/artifacts/src/tx-status.ts` |
| `3f701e39` | A `packages/artifacts/test/event-ledger-2-submit-outcome.test.ts` |
| `c98f6cfd` | M `packages/cli/src/commands/lock.ts` |
| `a663e980` | M `packages/cli/src/commands/tx.ts` |
| `1a828648` | M `packages/cli/src/runners/dev-tx-generate-runner.ts` |
| `543862b7` | M `packages/cli/src/runners/next-steps.ts` |
| `f815b325` | M `packages/cli/src/runners/tx-batch-runner.ts` |
| `420a739a` | M `packages/cli/src/runners/tx-flow.ts` |
| `d3bb2d0c` | M `packages/cli/src/runners/tx-plan-runner.ts` |
| `d5be1760` | M `packages/cli/src/runners/why-narrative.ts` |
| `488f3b06` | M `packages/cli/test/demo-cut-t-a14b-tx-status.test.ts` |
| `5152353b` | A `packages/cli/test/event-ledger-2-flow.test.ts` |
| `1f11b723` | A `packages/cli/test/event-ledger-2-json-contract.test.ts` |
| `21db5048` | A `packages/cli/test/event-ledger-2-report.test.ts` |
| `197a7ba2` | A `packages/cli/test/event-ledger-2.test.ts` |
| `b68cd89c` | M `packages/cli/test/wave1-3-cli-helpers.test.ts` |
| `e263bffb` | M `packages/core/README.md` |
| `f7215236` | M `packages/core/src/append-coordinator.ts` |
| `5d21a482` | M `packages/core/src/events.ts` |
| `be66b199` | A `packages/core/test/event-emission-guard.test.ts` |
| `e1e1b2ed` | A `packages/core/test/event-ledger-2-closeout.test.ts` |
| `7b3118dd` | A `packages/core/test/event-ledger-2-effect.test.ts` |
| `2473f38d` | A `packages/core/test/event-ledger-2.test.ts` |
| `949e949d` | M `packages/dev-server/src/routes/stream.ts` |
| `76453a86` | M `packages/dev-server/src/stream.ts` |
| `100140ea` | M `packages/dev-server/src/watcher.ts` |
| `df02ca72` | M `packages/kaspa-rpc/src/json-rpc-client.ts` |
| `8bc2ca60` | M `packages/sdk/src/artifacts-manager.ts` |
| `51f0cef4` | M `packages/sdk/src/tx.ts` |
| `5fd667eb` | M `packages/sdk/src/workflow.ts` |
| `06beca7a` | A `packages/sdk/test/event-ledger-2-effect.test.ts` |
| `854add09` | A `packages/sdk/test/event-ledger-2-submission.test.ts` |
| `865f4214` | M `packages/testing/src/scenarios.ts` |

The round-2 patch (`closeout/round-2/final-closeout-incremental.patch`, sha256 `b1159436…`, 23 files, +1542 / −228) is
the difference between the round-1 full tree `b5e9fde9` and this state, code and tests only; the round-1 patch
(`closeout/round-1/closeout-incremental.patch`, 6 files) is the difference between `ac80a9a8` and `b5e9fde9`. The
whole wave against base `71ff614f9` is the 34 paths above.

`packages/core/src/lock.ts` (the general workspace lock) is unchanged, as the reviewer required. `MANIFEST.sha256` in
this folder lists the sha256 of every evidence file except itself.

## 9 · Tickets to register

- **ARTIFACT-ANNOUNCE-2** (medium): announce through `emitArtifactWritten` the artifacts still written outside the
  boundary — the trace and the state snapshot of `commitSimulatedExecution` (`localnet/src/pending-execution.ts`),
  `localnet/src/receipts.ts` (`store.writeArtifact`), `sdk/src/observe/index.ts`, and the direct `writeArtifact` calls
  of `cli/src/runners/{l2-tx-runners,l2-contract-runners,bridge-local-runner,silver-records}.ts`.
- **SIMULATOR-STATE-TRUST-1** (from the investigation): `dag simulate-reorg` mutates `localnet.json` with no evidence.
- **APPEND-LOCK-LEGACY-RECORD-1** (low): a record without hostname left by an earlier HardKAS is only recovered when
  its pid is dead here and the file is ≥ 60 s old; `lock list` reports it as unverifiable. Both go away once every
  writer is on this release; documented, not fixed.
- **POST-BROADCAST-ERROR-EFFECT-1** (medium, from the closeout): a NON-ledger error after the broadcast (the disk
  while the submission is written, a plugin's `onTxSent`) leaves `sdk.tx.send` without a named effect; the CLI's
  flow no longer says "did not broadcast" in that case (it takes the effect from the send result), but the SDK does
  not enrich the error. A1 covers the ledger's failures, which is its scope.
- **PLAN-STORE-ENTRY-1** (low, found by `fc-json-1`): `tx plan` stores its workspace copy as
  `.hardkas/artifacts/<timestamp>-<planId>.plan.json` (`cli/src/commands/tx.ts`), not at the canonical entry
  `plans/txPlan-<contentHash>.json` that `persistExecutionMaterial` checks, so the first `simulate` of such a plan
  publishes it a second time (a duplicate entry, one extra `artifact.written`). Harmless for evidence; it decides
  which event is the first one a `tx send <signed.json>` records.
- Residual, documented in `closeout/round-2/EL2-FINAL-CLOSEOUT.md`: a node rejection in a format other than
  `Rejected transaction …`, and a failure before sending inside `submitTransaction`, are reported as `unknown`
  (conservative: never a false rejection, never a claimed broadcast); a failed call records `txId: "unknown"` in the
  submission (the R-iii contract) while the effect names the signed artifact's txId; an empty recovery lock past the
  2 s creation grace is judged abandoned (fail closed, no corruption) even if its recoverer is only stalled; the
  administrator's own `lock clear` is not atomic either (an explicit action); in the query-store the trace of a send
  with an unknown outcome stays `running` (correct: it is not resolved).
