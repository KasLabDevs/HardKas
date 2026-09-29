# Wave 2(c) ledger — AUD-19 (pending-spend exclusion with mempool evidence)

Order: REPRODUCE → TEST FAILING → MINIMAL FIX → TARGETED PASS → FULL REGRESSION.
Base: Wave 2(b) tree (`WAVE_2B_SECURITY_REVIEW — PASS`), uncommitted. Version stays `0.12.0-rc.23`. No commits by me.
Mandate (`GO WAVE 2(c)`, AUD-19 only): before the snapshot reaches the Generator, exclude every outpoint with current evidence of a relevant pending spend; tie the exclusion to a sufficiently recent mempool observation; fail conservatively when it cannot be determined; never promise that "not in my mempool" means "no competing spend on the network".

## 1. Finding / root cause (pre-2(c) tree)

| Label | Root cause |
|---|---|
| AUD-19 (CLI) | `tx-plan-runner.ts` carried the comment "Pending-Spend Safety (rc.12) — load registry, reconcile against live mempool, filter" followed by `let spendableUtxos = matureUtxos;`: no exclusion of any kind on the CLI network path |
| AUD-19 (SDK) | `sdk.tx.plan` asked `getSpendableUtxos({ excludePending: true })`, whose toolkit implementation excluded mempool-spent outpoints BUT silently skipped the whole check when the RPC client exposed no `getMempoolEntriesByAddresses` (no error, no evidence), and recorded nothing about what it filtered against |
| Dead code | `packages/sdk/src/pending-spends.ts` (`PendingSpendService`: an rc.12 local registry with reconcile/persist) is referenced by nothing in `src`; the rc.12 design was never wired |
| Narrative | no plan artifact stated whether pending spends had been excluded, against which observation, or with what guarantee |

## 2. Reproduction BEFORE

Structural, quoted from the files as read: the CLI line `let spendableUtxos = matureUtxos;` under the "Pending-Spend Safety" comment; the toolkit's `if ("getMempoolEntriesByAddresses" in this.rpc …)` guard with no else branch; no `pendingSpendEvidence` anywhere. The new suite's assertions (A excluded from the CLI plan; explicit `PENDING_SPEND_ALL_EXCLUDED`; `PENDING_SPEND_EVIDENCE_UNAVAILABLE` on RPC failure or missing method; evidence in the artifact) are all false on that tree.

## 3. Regression tests (written first)

`packages/cli/test/wave2-c-pending-spend.test.ts` (in-process CLI runner with a scripted node whose mempool is controlled; SDK real-node path with `sdk.rpc` scripted; kaspa-wasm Generator from the toolchain baseline):

| Test | Property |
|---|---|
| `derivePendingSpentOutpoints` | only SENDING entries of the sender's address exclude; `previousOutpoint`/`previous_outpoint` shapes; other addresses' entries ignored |
| T-A19 · exclusion | a mempool transaction spending outpoint A ⇒ the plan selects only B; `metadata.pendingSpendEvidence = { source: mempool, scope: observer-local, address, observedAtDaaScore (= the snapshot's virtual DAA), sendingEntries: 1, excludedOutpoints: [A], guarantee: local-orchestration-only… }`; the evidence text never says "network guarantee"/"consensus"/"no competing spend exists"; `utxoSelection.warnings` names the exclusion |
| T-A19 · receiving | a mempool transaction merely paying the sender excludes nothing |
| T-A19 · all excluded | every spendable outpoint pending ⇒ `PENDING_SPEND_ALL_EXCLUDED` (explicit; not a generic insufficient-funds) |
| T-A19 · no evidence | mempool RPC failure, or a client without `getMempoolEntriesByAddresses`, or `observePendingSpends({})` ⇒ `PENDING_SPEND_EVIDENCE_UNAVAILABLE`, no plan |
| T-A19 · SDK ≡ CLI | the SDK real path excludes A through the same observation (mempool RPC called), records the same evidence, and yields the same inputs/fee/mass as the CLI; an RPC failure refuses with the same code |
| simulator | no pending-spend evidence is recorded (no mempool exists) and nothing is claimed about one |

Re-based fixtures: the 2(b) scripted client and the execution-guard client now answer `getMempoolEntriesByAddresses` with an empty mempool (the observation is mandatory on the network path).

## 4. Minimal diff

- `packages/tx-builder/src/pending-spends.ts` (new): `derivePendingSpentOutpoints(response, address)`, `observePendingSpends(rpc, address, observedAtDaaScore?)` (ONE observation or `PendingSpendEvidenceUnavailableError`), `PendingSpendAllExcludedError`, `PendingSpendEvidence` record with `scope: "observer-local"` and the literal `PENDING_SPEND_GUARANTEE`, `utxoOutpointKey`; exported from the package index.
- `packages/cli/src/runners/tx-plan-runner.ts`: inside the existing fingerprint bracket (after the UTXO read at `vBefore`): `observePendingSpends(client, fromAddress, vBefore.virtualDaaScore)` → filter → `PENDING_SPEND_ALL_EXCLUDED` when nothing remains → `excludeOutpoints` handed to `planTransactionUpstream` → evidence stored with the plan; both errors pass through the RPC-error classification untouched. The "rc.12" comment block is replaced by the real mechanism.
- `packages/toolkit/src/query-api.ts`: `spendableUtxos` uses `observePendingSpends` (fail-closed when the client cannot ask or the node cannot answer), accepts `observedAtDaaScore`, returns `pendingSpendEvidence`.
- `packages/sdk/src/query.ts` (`observedAtDaaScore` pass-through), `packages/sdk/src/tx.ts` (`plan()` real path: reads the virtual DAA as the recency anchor, captures the evidence and records it in the artifact).
- `packages/core/src/runtime-context.ts` (`pendingSpendEvidence` on the plan ctx) and `packages/artifacts/src/tx-plan.ts` (`metadata.pendingSpendEvidence`, authenticated with the plan).

Not touched (scope): `PendingSpendService` (dead rc.12 registry) — left in place, flagged for a decision (delete or wire as a second, HardKAS-own source); docs `localnet-node.md:55` claim (docs gates do not run in CI); the simulator (no mempool → no evidence, stated).

## 5. Verification

| Run | Result |
|---|---|
| `w2c-after1` (T-A19 + 2(b) + execution guard + toolkit) | **34 / 34** first run |
| `pnpm typecheck` | 0 errors (55/55); native `.node` restored |
| directed `w2c-fallout1` (cli, sdk, toolkit, tx-builder, core, artifacts trees, CLI dist rebuilt: 452 files) | **1036 passed / 0 failed / 15 skipped**, PASS |
| `pnpm version:check` | all at `0.12.0-rc.23` |
| lint (cli, sdk, toolkit, tx-builder, core) | only the 2 pre-existing `sdk` errors |
| Full hermetic gate `w2c-full1` | see §6 |

## 6. Full gate

`w2c-full1` (CLI dist rebuilt first): **838 files / 1891 tests / 1863 passed / 0 failed / 28 skipped (pre-existing)**, `gate-hermetic: PASS`, 0 non-loopback attempts, 581 s. Loopback targets unchanged since Wave 0 (127.0.0.1:18210 ×3, :19999 ×1, :7420 ×2, :8545 ×9). Previous gate (2(b)): 1856 → +7 tests (the new suite). No source changed after the gate; native binary and lockfile untouched.

## 7. Derived decisions (for the reviewer)

1. **Evidence = the node's mempool for the sender's address, SENDING entries only**, read inside the same fingerprint bracket as the UTXO snapshot; the recency anchor recorded is `vBefore.virtualDaaScore` (CLI) / the virtual DAA read just before the query (SDK). A change of virtual state between the read and the confirmation query still discards the attempt as before.
2. **Fail closed, no opt-out**: a client without the method or a node that errors refuses to plan (`PENDING_SPEND_EVIDENCE_UNAVAILABLE`). No flag bypasses it in this wave; if a bypass is ever wanted it must be an explicit, recorded user choice.
3. **Explicit exhaustion**: when every spendable outpoint is pending the runner says so (`PENDING_SPEND_ALL_EXCLUDED`, with the count and the observation point) instead of letting the Generator report insufficient funds.
4. **Guarantee wording** is fixed in one literal (`PENDING_SPEND_GUARANTEE`: "local-orchestration-only … absence from that mempool does not prove absence of a competing spend on the network") and travels with every plan that used it.
5. **HardKAS's own just-submitted transactions** are covered by the same evidence on the same node (a successful `submitTransaction` means the node admitted the tx to its mempool); a different node's view is exactly what the guarantee text excludes. The dead rc.12 registry is therefore not revived here.
6. `derivePendingSpentOutpoints` keys entries by exact address string equality (as the previous toolkit code did); address normalisation is not attempted.

## 8. Status

Wave 2(c): IMPLEMENTED — §6 green. Checkpoint: `WAVE_2C_IMPLEMENTED — PENDING ADVERSARIAL REVIEW`. Next per the ratified order: (d) AUD-18 real fee on receipts/submissions.
