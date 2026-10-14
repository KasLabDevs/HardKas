# EVENT-LEDGER-2 · final closeout (limited GO)

**Base:** hk-ra, on top of the closeout tree the reviewer already saw (`b5e9fde9`). That tree sits on the EL-2 tree `ac80a9a8`, which sits on base `71ff614f9`.

**Not done:**
- no commit, push or version;
- nothing applied to the main checkout;
- the 4 JSON-PAPERCUTS files not touched;
- the general `core/src/lock.ts` untouched;
- the demo's localnet untouched;
- no new event kinds;
- no full gate (pending the reviewer's confirmation of this diff).

## Decisions

| # | Decision | Status |
|---|---|---|
| 1 | **A1** | **Implemented.** The typed `EVENT_LEDGER_APPEND_FAILED` stays. Every execution/broadcast boundary names the effect (`metadata.effect` plus a message that leads with it). tx-flow keeps the code, the effect and the partial result. No broad API change (see the list at the end). |
| 2 | Rejection vs unknown | **Implemented with existing types:** `rpc.error` (existing kind) and `INSUFFICIENT_EVIDENCE` (existing state). No consensus state invented. |
| 3 | CL-3 | Unchanged. |
| 4 | CL-4 fail closed | **Implemented.** No recovery lock is ever removed automatically. An abandoned one fails typed and immediately (`APPEND_LOCK_RECOVERY_BLOCKED`); the administrator clears it with the existing lock tools. |
| 5 | Intent event | Deferred; nothing added. |

## Final effect semantics

**Classification of a submit result** (`submitOutcomeOf`, `@hardkas/artifacts`). It applies to recorded evidence, so it works the same for sending, `tx status` and `why`:

| Recorded `submitResult` | Outcome |
|---|---|
| `accepted: true` | `accepted`: RPC acceptance of the request, **not** acceptance or confirmation in the DAG |
| `accepted: false` without `error` (the call answered) | `rejected` |
| `error` beginning with `Rejected transaction` (rusty-kaspa's RejectedTransaction; `fixtures/toccata-v2/silver/*/evidence.json` record real ones) | `rejected` |
| anything else (timeout, lost connection, …) | `unknown`: never presented as a rejection |

This is the definition already ratified in Wave 2(a) Q4: `REJECTED_BY_NODE` = "the node answered `RejectedTransaction`". Before this change, the implementation also applied it to a timeout.

**Without a ledger failure:**

| Case | Ledger event | `tx status` | Workflow / CLI |
|---|---|---|---|
| accepted | `workflow.submitted` | `SUBMITTED` | `outcome: submitted` |
| node rejected it | `workflow.failed` ("the node rejected the submission: …") | `REJECTED_BY_NODE` | `TX_SUBMISSION_REJECTED`, `outcome: rejected` |
| no answer | **`rpc.error`** (`retriable: false`, "the outcome of the submission is unknown"); **no** `workflow.failed` and **no** `workflow.receipt` | **`INSUFFICIENT_EVIDENCE`** ("whether the node received it is unknown … observe it") | **`TX_SUBMISSION_OUTCOME_UNKNOWN`**, **`outcome: unknown`**, title "Submission outcome UNKNOWN" |

**With a ledger failure** (still `EVENT_LEDGER_APPEND_FAILED`; exit 1):

| `effect.outcome` | Situation | The message starts with | CLI `outcome` |
|---|---|---|---|
| `not-performed` | the ledger failed before anything was sent or executed | "Nothing was sent / Nothing was executed …" (+ "run the command again") | `failed` |
| `accepted` | the node accepted the request | "The node ACCEPTED the submission of transaction X (acceptance of the request by the RPC, not acceptance or confirmation in the DAG): it WAS sent … Do not send it again" | `submitted` |
| `rejected` | the node rejected it | "The node REJECTED transaction X with an explicit answer" | `rejected` |
| `unknown` | the call failed without an answer | "The outcome of sending transaction X is UNKNOWN … may have received it … do not send it again before checking it" | `unknown` |
| `executed` | the simulator executed it | "The simulator EXECUTED transaction X: the simulated state changed … Do not execute it again" | `submitted` |

When an effect took place, the message never says "repeat the step". It also always keeps the original evidence sentence ("could not be recorded in …: cause"). The effect names the txId and the artifact (submission/receipt) with its path.

**Boundaries covered:**
- `sdk.tx.send`:
  - before the broadcast: `onBeforeTxSend` → `not-performed`;
  - after the broadcast: writing the submission, the result event, `onTxSent` → the recorded outcome.
- `sdk.tx.simulate`:
  - before the commit: plan, execution material → `not-performed`;
  - after the commit: receipt announcement → `executed`.
- `sdk.workflow`: the 4 writes after send/simulate.
- CLI `tx-flow`:
  - `workflow.started` and the plan/sign announcements → `not-performed`;
  - after the send → the send result's effect;
  - inside the send → the effect the SDK named, **never assumed** (if the SDK named none, the message stays the generic "may already have been executed or submitted");
  - each error now lands on **the step where it happened** (before, a failure in the plan's announcement was attributed to the sign step).
- CLI `tx send`:
  - both modes: a ledger failure that stops the command writes the JSON with `outcome` and `effect`;
  - shortcut mode: the step's report keeps the code, `effect` and `data` (partial results), and never says "did not broadcast" if the send ran.

## Point 4 · recovery lock

- **Path:** `.hardkas/locks/append-<file>.recover.lock` (before: `<lock>.recover`). It is now a workspace lock, so `lock list` / `lock doctor` show it.
- **An existing one:**
  - recoverer alive (including this very process or another host) → wait (`APPEND_LOCK_TIMEOUT` after 10 s);
  - recoverer gone → **fails immediately** with `APPEND_LOCK_RECOVERY_BLOCKED` (wrapped in `EVENT_LEDGER_APPEND_FAILED` when it comes from the ledger).
- **The error names the administrative step:**
  - `hardkas lock clear append-<file>.recover --if-dead` (it checks that its process is dead);
  - or `--force` if it is empty (no process to check).
- **No automatic removal of any recovery lock remains.** Read/compare/unlink is used only:
  - to release the lock this call itself created (nobody else removes it);
  - to remove the judged append lock under the exclusive recovery lock.
- **The automatic recovery of an abandoned append lock still works** when no recovery lock is in the way: EL2-I1, and the second half of CL-4c (after `lock clear`, the next append recovers by itself).

## Results (hermetic runner, 0 non-loopback connections)

| Run | Result |
|---|---|
| `fc-before-1` (tree `b5e9fde9`) | **19 red / 45 green controls**, each red for the intended reason:<br>• effect missing (7 SDK);<br>• unknown outcome presented as a rejection (3 SDK, 1 artifacts, 1 tx-flow `workflow.receipt failed`, 1 `why`);<br>• `why` calls RPC acceptance plain "accepted" (1);<br>• tx-flow loses the code / effect / partial result and attributes the failure **to the wrong step** (3);<br>• abandoned recovery lock removed automatically (2). |
| `build-final-after-1` | **failed**, TS2677 in my own code (kept; fixed) |
| `build-final-after-2` | 24/24 |
| `fc-after-1` (focused) | **81/81** |
| `fc-related-1` | 80 passed / 0 failed / 5 skipped (pre-existing `describe.skip` in `workflow-corpus.test.ts`) |
| `fc-related-2` | 218 passed / 0 failed / 1 skipped (`localnet-fund-race` needs a real localnet). Covers the durable simulator (SDK + CLI), json-papercuts, narratives, lifecycle R0/R0B, SURFACE-TRUTH, EVIDENCE-TRUST, REPLAY-TRUST-2, WORKSPACE-AUTHORITY, deploy containment. |
| Hardening after `fc-after-1` | tx-flow no longer assumes "not sent" when the ledger fails inside the send without a named effect, and the shortcut mode's JSON carries `outcome`/`effect` when the ledger fails at the start. New test F4. |
| `fc-before-2` (supplemental, `tx-flow.ts` from `b5e9fde9`) | the 5 flow tests red, including F4 (code lost). The 2 `why` tests ran against the new narrative and are green. |
| `build-final-after-3` | 24/24 |
| **`fc-after-2` (final focused)** | **106/106**: everything EL-2 + `tx-flow-outcome`, AUX-11 (`wave2-e-send-outcome`), the forbidden narratives (`no-false-claims`), json-papercuts, and the CLI EL-2 test (EL2-I1/I2/I4, D6, D7). |
| `fc-after-3` | 13/13: the 3 test files whose fixture now uses `HARDKAS_VERSION` |
| `fc-json-1` | 1/2 red: my premise, not the product (see "Reviewer's final check"); kept |
| `fc-json-2` | **3/3**: the JSON contract at process level |
| **`fc-gate-1` (final full gate)** | **PASS: 2785 tests, 2757 passed, 0 failed, 28 skipped** (444 files + 7 skipped, 1406 s); 0 non-loopback; `C:\.hardkas` absent before and after. Against `el2-gate-1` (2749 / 2721 / 0 / 28): **+36 tests = exactly the closeout's** (core closeout 4, core effect 3, artifacts 3, SDK effect 7, SDK submission 6, CLI flow 7, CLI report 3, CLI json-contract 3). Against develop (2719 / 2691 / 0 / 28): +66 = the wave's 30 + the closeout's 36. The only side effect was the pre-existing LF rewrite of the wave1-1 snapshot (content identical), restored. |

## Reviewer's final check · the JSON contract at process level

The ask: `tx send --json` + a ledger failure, before sending and after a known effect, must write exactly one parseable JSON, exit 1, `EVENT_LEDGER_APPEND_FAILED`, the right `outcome`, and the `txId` when available. Runtime regression: `cli/test/event-ledger-2-json-contract.test.ts` (the built CLI, a simulated workspace, a live process holding the append lock of `events.jsonl` for the whole command, so the command's first ledger event is the one that fails).

| Run | Result |
|---|---|
| `fc-json-1` (first run, kept) | 1/2 red. **Not a product defect and not a double emission** (one JSON was written): my premise was wrong. With a plan made by `tx plan --out`, the simulator re-publishes the plan into its canonical store entry **before** the commit, so the failing event came before the effect — and the product said so truthfully: `outcome: failed`, `effect.outcome: not-performed`, "Nothing was executed … the artifact … WAS written at …/plans/txPlan-…json". |
| `fc-json-2` | **3/3**, 0 non-loopback. |

The three cases, each asserting exactly one JSON document on stdout (`JSON.parse(stdout)` of the whole output + one chunk), exit 1, `code`, `outcome`, `effect`, 0 events recorded, the holder's lock intact:

| Case | Setup | `outcome` | `effect` | `txId` |
|---|---|---|---|---|
| 1 · before anything is sent | shortcut `tx send --from …`; `workflow.started` fails | `failed` | `simulated-execution` / `not-performed` | none (nothing planned) |
| 2 · before the effect, after an artifact write | plan + signed by `tx plan --out` / `tx sign --out`; the plan's canonical entry is announced before the commit | `failed` | `not-performed` | the signed artifact's synthetic txId; the message names the plan copy that WAS written; no receipt published |
| 3 · after a known effect | plan + signed by the SDK (canonical entries); the simulator committed; the receipt's announcement fails | `submitted` | `executed`, `artifactId` = the published receipt's contentHash, `artifactPath` = its store path | the synthetic txId; "The simulator EXECUTED transaction …: the simulated state changed … Do not execute it again"; exactly one receipt published |

**No product change was made for this check.** The double emission is prevented by construction (`getOutput()` is one instance per process; `handleError` writes its envelope only when `jsonWritten` is false) and is now proven at process level. The accepted-broadcast variant at process level would need a fake node on loopback; it stays covered in-process by the SDK tests (`event-ledger-2-effect.test.ts`).

**Pre-existing papercut found on the way (not EL-2's scope), proposed as `PLAN-STORE-ENTRY-1`:** `tx plan` stores its workspace copy as `.hardkas/artifacts/<timestamp>-<planId>.plan.json` (`commands/tx.ts:265-272`), not at the canonical entry `plans/txPlan-<contentHash>.json` the simulator checks (`persistExecutionMaterial`). The first `simulate` therefore publishes the plan a second time (a duplicate entry and one extra `artifact.written`). Harmless for evidence, but it is why case 2 exists.

## Deliberate changes to existing tests

- `core/test/event-ledger-2.test.ts`: the empty `.recover` test is **inverted** (reviewer decision 4). It now expects a typed failure plus intact locks, then `lock clear --force`, then automatic recovery.
- `core/test/event-ledger-2-closeout.test.ts` CL-4a/b: the recoverers hold both paths (the old one and the new one), so the same controls judge both versions; they are unchanged in substance.
- `cli/test/demo-cut-t-a14b-tx-status.test.ts` and `cli/test/wave1-3-cli-helpers.test.ts`: the synthetic node answer ("transaction is already in the mempool", "orphan") is replaced by its **real wire format** ("Rejected transaction <txId>: …"). Same assertions; green before and after.
- `sdk/test/event-ledger-2-submission.test.ts`: a title only.

## Contract-visible changes (all additive and narrow; listed for veto)

1. `@hardkas/core`:
   - `LedgerFailureEffect`, `rethrowWithLedgerEffect`;
   - `EventLedgerAppendError.effect` + `metadata.effect` (a class new in EL-2, unpublished);
   - new code `APPEND_LOCK_RECOVERY_BLOCKED`;
   - recovery lock path.
2. `@hardkas/artifacts`: `SubmitOutcome`, `submitOutcomeOf`. `deriveTxStatus` gives `INSUFFICIENT_EVIDENCE` (an existing state) for a submission with an unknown outcome.
3. SDK:
   - a failed call without an answer emits `rpc.error` instead of `workflow.failed`;
   - workflow `TX_SUBMISSION_OUTCOME_UNKNOWN`.
4. CLI:
   - `outcome: "unknown"` (new value);
   - code `TX_SUBMISSION_OUTCOME_UNKNOWN`;
   - JSON for a ledger failure with `outcome` / `effect` / `data`;
   - `TxFlowStepResult.code` / `.effect`;
   - batch / dev generate: `sendOutcomeUnknown: true` instead of `sendRejected` for the unknown case.

## Residual risks

1. **A rejection in another format:** a node rejection that does not use the `Rejected transaction …` format (e.g. a request conversion error) is reported as `unknown`. This is conservative: never a false rejection.
2. **Failures before sending inside `submitTransaction`** (cannot connect, local validation, storage mass) are also reported as `unknown`. Conservative: they claim neither a rejection nor a broadcast.
3. **A failed call records `txId: "unknown"`** in the submission (an existing R-iii contract). The effect and the messages name the signed artifact's txId instead.
4. **A non-ledger error after the broadcast** (disk while writing the submission, a plugin): `sdk.tx.send` throws it without an effect. The CLI no longer says "did not broadcast" in that case (it takes the effect from the send result), but the SDK does not enrich it. **Follow-up ticket proposed: `POST-BROADCAST-ERROR-EFFECT-1`.**
5. **A stalled recoverer:** an empty recovery lock past the 2 s grace is judged abandoned, so the append fails closed even if its recoverer is only stalled for more than 2 s between creating it and writing its record. There is no corruption. However, the advice `--force` (an explicit administrative action) could then remove the lock of a live recoverer; that would require a stall of more than 2 s inside a window of microseconds.
6. **The administrator's own `lock clear`** (read/judge/unlink) is not atomic either. Two simultaneous administrators while a recoverer starts could race; this is an explicit action and negligible.
7. **In the query-store,** the trace of a send with an unknown outcome stays `running` (there is no terminal workflow event). This is correct (it is not resolved), and it is visible in dashboards.

## Diff (against `b5e9fde9`)

| | |
|---|---|
| Code tree (base `71ff614f9` + the wave's code and tests, the evidence folder excluded; what LEDGER §8 records) | `68fc258506aa04aeefbf1abb6a39885f88179d99` — 34 paths, +3312 / −371 (`manifest-code-m3`) |
| Patch, code and tests only (the evidence folder excluded by pathspec) | `closeout2/final-closeout-incremental.patch` (`git diff-tree -p --binary --output`) |
| Patch sha256 | `b1159436c305a2fffc217d352ffc6006218a368f15a749327e11fe5b72974853` |
| Size | 23 files, +1542 / −228 |
| Blobs per path | `closeout2/final-blobs.txt` |
| Full tree (code + tests + the evidence folder with its `MANIFEST.sha256`) | given with the hand-over, after the manifest |

The 23rd file against the previous calculation is the JSON-contract regression (`cli/test/event-ledger-2-json-contract.test.ts`). The new test fixtures use `HARDKAS_VERSION`, not a literal version (no "rc.XX" in code). Earlier calculations (`34905fbc` before that fixture change, `ea4d7139` before the JSON-contract test) are kept in `closeout2/superseded/`.

Code (12):
- `artifacts/src/tx-status.ts`
- `cli/src/commands/tx.ts`
- `cli/src/runners/{tx-flow,next-steps,why-narrative,tx-batch-runner,dev-tx-generate-runner}.ts`
- `core/README.md`
- `core/src/{events,append-coordinator}.ts`
- `sdk/src/{tx,workflow}.ts`

Tests (10):
- new:
  - `artifacts/test/event-ledger-2-submit-outcome`
  - `cli/test/event-ledger-2-{flow,report}`
  - `core/test/event-ledger-2-effect`
  - `sdk/test/event-ledger-2-effect`
- modified:
  - `core/test/event-ledger-2{,-closeout}`
  - `sdk/test/event-ledger-2-submission`
  - `cli/test/{demo-cut-t-a14b-tx-status,wave1-3-cli-helpers}`

The tree was computed with a temporary index; hk-ra's real index is untouched (`diff --cached --quiet` = 0). The build's side effect on the pskt `.node` was restored after each build. The evidence folder (LEDGER/MANIFEST) is still the reviewed one; it is updated after the full gate.

## Closure proposal

1. The reviewer confirms this diff and the effect semantics.
2. **One** full gate.
3. Manifest + LEDGER (§2, §7, §8 + final closeout) + evidence folder.
4. GO for integration (the owner commits).
