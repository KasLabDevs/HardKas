# Wave 2(a) ledger — Q4 as ratified: `deriveTxStatus` + `hardkas.txObservation.v1` + RPC observer + T-RS-1…9

Order: REPRODUCE → TEST FAILING → MINIMAL FIX → TARGETED PASS → FULL REGRESSION.
Base: Wave 1 tree (owner commit `5c2f0ec4f` + uncommitted B1/B1-bis/B2 + 1.4 + 1.5). Version stays `0.12.0-rc.23`. No publish, no changesets, no commits by me.
Mandate: Q4 RATIFIED 2026-09-26 with point 4 changed (`minConfirmations = 100` only as an explicit HardKAS policy default, never a Kaspa parameter) and two precisions (`SUBMITTED` ≠ "in mempool"; `FINALIZED` = final according to the observed Kaspa virtual-chain finality rule at that observation point). Governing principle: **persist facts; derive states; never persist a mutable transaction status as evidence.**

## 1. Finding / root cause (pre-2(a) tree)

| Label | Root cause |
|---|---|
| Q4 / IC-2′.4 | no derivation existed: "status" was whatever a receipt said; `sdk.tx.status(txId)` returned the raw `getTransaction` answer (an external tx index the node does not have) or a fixed `simulated_confirmed` |
| IC-2′.3 | no observation artifact: `waitForAccepted`/`waitForConfirmations` polled the node and returned in-memory verdicts (nothing persisted, nothing verifiable later); `waitForAccepted` called `(rpc as any).call("getVirtualChainFromBlockV2", …)` and swallowed every error |
| Q4 point 3 | three units for "confirmations": SDK `waitForConfirmations` = DAA delta; toolkit `query-api.confirmations` = blue delta + 1; the node's `minConfirmationCount` = blue delta |
| IC-2′.7 / T-RS-9 | nothing prevented a simulator txId from being asked for a network state |
| IC-2′.8 / T-RS-8 | no rule that only FULL-scope evidence decides a state |
| N10 (partial) | `txReceipt.v2` fields (`confirmations`, `acceptingBlockHash`, `observedAtDaaScore`) now have a home (the observation); the v2 schema/enum reconciliation itself stays in (g) |

## 2. Upstream established (Q4 STOP condition satisfied)

rusty-kaspa master (2026-09-26) and tag v2.0.1 (identical constants): `submitTransaction` success = node returned `transactionId` (its mempool, local); `getMempoolEntry` → `{fee, transaction, isOrphan}`; acceptance per selected-chain block via `getVirtualChainFromBlock[V2]` with `removedChainBlockHashes`; the node applies `minConfirmationCount` as `sinkBlueScore − chainBlock.blueScore`; `finality_depth = 10 BPS × 43 200 s = 432 000` blocks on mainnet, testnet-10, simnet and devnet; a candidate reorging below the finality point is "ignored from Virtual chain"; pruning ≈30 h; wallet user-tx maturity 100 DAA (policy, other unit). Recorded with provenance in `packages/core/src/kaspa-params.ts` and in the memory note `reference-kaspa-tx-state-upstream`.

## 3. Reproduction BEFORE

Structural: `packages/artifacts/src/tx-status.ts` and `tx-observation.ts` did not exist (the new artifacts suite fails at import); `sdk.tx.status` returned `rpc.getTransaction` / `"simulated_confirmed"`; `waitForConfirmations` computed `virtualDaaScore − daaScore(accepting block)`; `toolkit.confirmations` added `+1`. Each is quoted in §1 from the files as read before the change (`packages/sdk/src/tx.ts:122-245, 1582-1590`, `packages/toolkit/src/query-api.ts:160-181`).

## 4. Regression tests (written first)

| Test file | Property |
|---|---|
| `packages/artifacts/test/adversarial/wave2-a-derive-tx-status.test.ts` | provenanced params (432 000 on the 4 verified networks, `undefined` for `simulated`/`testnet-11`); default policy is `hardkas-product-default`/blue-score/v1; **T-RS-1** submission alone → `SUBMITTED` (never confirmed), rejected → `REJECTED_BY_NODE`, nothing → `INSUFFICIENT_EVIDENCE`; **T-RS-2** `MEMPOOL_ACCEPTED`/`MEMPOOL_ORPHAN`, absence is not evidence; **T-RS-3** `ACCEPTED` at 99, `CONFIRMED` at 100 (blue), a 9 000-DAA / 3-blue observation stays `ACCEPTED`, a user policy of 5 confirms at 5, the CONFIRMED reason names the policy and never "kaspa parameter"; **T-RS-4** accepted → removed = `REORGED`, then a new block = `ACCEPTED` again; **T-RS-5** `FINALIZED` only at the verified depth with the finality rule wording (never "irreversible"), producer refuses shallower/mis-declared/unknown-network finality, verifier flags a hand-sealed incoherent one (`OBSERVATION_INCOHERENT`) and the derivation ignores it; **T-RS-6** finality then removal = `CONFLICTING_OBSERVATIONS`; **T-RS-7** `UNOBSERVABLE_PRUNED`, an earlier durable finality stands; **T-RS-8** LEGACY (v4 twin) and tampered observations are ignored and reported; **T-RS-9** simulator receipt → `SYNTHETIC_EXECUTED`, synthetic + network evidence → conflict; two current accepting blocks → conflict; order independence; an observation is FULL v5 without lineage/workflow fields, stored under `observations/`, listed by txId with tampered copies rejected; coherence arithmetic; synthetic finding ⇔ synthetic observer |
| `packages/sdk/test/adversarial/wave2-a-tx-observer.test.ts` | `observeTxOnce` against a scripted node: mempool → `chain_accepted` (blue 3 while DAA 9 000) → `chain_removed` → `finality_reached`; evidence lists the RPC calls; pruned cursor → `pruned_unobservable`; unseen → `not_found` with the scanned window. SDK: the submission carries `submitPoint`; `status` = `SUBMITTED` until observed; `observe` persists FULL observations under `.hardkas/artifacts/observations/`, status follows `MEMPOOL_ACCEPTED → ACCEPTED → CONFIRMED(100)`, observers are described not identified; `waitForAccepted`/`waitForConfirmations` count blue score (DAA racing ahead does not confirm) with a caller policy (`origin: user`); reorg derived as `REORGED` then `ACCEPTED` by the new block; a planted v4 observation never decides; the simulator's txId is `SYNTHETIC_EXECUTED` and cannot be observed (`OBSERVATION_SYNTHETIC_TXID`) |

## 5. Minimal diff (files)

Core: `kaspa-params.ts` (new; provenanced table + `finalityDepthFor`), `registry.ts` (`TxObservationV1`), `index.ts` (`txObservation.v1`, export), `corruption.ts` (`OBSERVATION_INCOHERENT`).
Artifacts: `schemas.ts` (`TxObservationSchema` with point/observer/finding union/evidence; `TxSubmissionSchema.submitPoint` optional), `tx-observation.ts` (new; coherence rules, producer, `evidenceDigest`, interim observer descriptions), `tx-status.ts` (new; policy, `deriveTxStatus`, `isConfirmed`), `verify.ts` (schema case, coherence → `OBSERVATION_INCOHERENT`, observation exempt from workflow/assumption metadata like a MigrationReceipt), `lineage.ts` (an observation is not a lineage link: no `MISSING_LINEAGE`), `resolve.ts` (`observations` canonical subdir), `store.ts` (`observations/` placement; `listObservationsByTxId` FULL-only with rejections reported), `identity-categories.ts` (`submissionArtifactId` CONTENT, `sinkHash`/`pruningPointHash` NETWORK, `responseDigest` DOMAIN_DIGEST), `constants.ts` (`TX_OBSERVATION`), `index.ts` (exports).
SDK: `tx-observer.ts` (new; `TxObserverRpc` facade, `rpcObserverFor(client)` recording raw responses as evidence, `observeTxOnce`), `tx.ts` (`observe`, derived `status`, `waitForAccepted`/`waitForConfirmations` on observations in blue score, `submitPoint` captured at real send).
Toolkit: `query-api.ts` confirmations without `+1`.
Snapshot: `wave1-1-canonical-v5.test.ts.snap` acknowledges `TxObservationSchema.{createdAt,hardkasVersion,rpcUrl}` (the only unauthenticated top-level fields it declares).

## 6. Derived decisions (for the reviewer)

1. Observer identity (interim, D-Q1.a still blocked): `observer = { kind, networkId, serverVersion?, capabilities, description }` authenticated; `rpcUrl` unauthenticated; the description literal is "observation obtained through the configured RPC observer". No narrative says "node X attested".
2. The observation's `networkId` is the submission's (the SDK's network), not a name the node prints; `finalityDepthFor` is keyed by it, so a `simulated` network can never reach `FINALIZED`.
3. `submitPoint` on the submission is an authenticated fact about the submit (cursor for the observer), optional and best effort; absence falls back to the last observation, then the pruning point with a bounded scan (`maxBatches`, default 20 ≈ 50k chain blocks); exhaustion yields `not_found` with `scannedFrom/scannedTo` so the next observation continues, never a claim.
4. One observation per look; the observer re-measures a previously established accepting block first (still on chain → depth from the current sink; reported removed → `chain_removed`), then mempool, then the chain window.
5. Failed synthetic id shape and `SYNTHETIC_EXECUTED` derive from the simulator receipt; the simulator is not yet converted to submission + synthetic observation (IC-2′.7 second half) — left for a later step, noted.
6. `waitForAccepted`/`waitForConfirmations` now persist observations on every poll (evidence of the wait); their return shapes keep `status/confirmations/acceptingBlockHash` and add `derived`; `confirmations` is blue score.
7. `sdk.tx.status()` no longer touches the RPC; it derives from the workspace. The CLI `tx status <path>` (signature coverage of a plan/signed file) is unrelated and untouched; CLI narratives of network state are (f).

## 7. Verification

| Run | Result |
|---|---|
| `w2a-after1` → `after3` | 30/37 → 34/37 → 19/21 (store subdir, snapshot, fixture, cursor/re-check fixes) |
| directed fallout `w2a-fallout1` (artifacts, sdk, core, toolkit, localnet, query, query-store: 365 files) | **888 passed / 0 failed / 6 skipped** (includes the two new suites: 14 + 7) |
| `pnpm typecheck` | 0 errors (55/55) after two exactOptionalPropertyTypes fixes; native `.node` restored |
| `pnpm version:check` | see §8 |
| lint (artifacts, sdk, core, toolkit) | see §8 |
| Full hermetic gate `w2a-full1` (CLI dist rebuilt first) | see §8 |

## 8. Full gate / freeze

- Full hermetic gate `w2a-full1` (CLI dist rebuilt first): **834 files / 1879 tests / 1851 passed / 0 failed / 28 skipped (pre-existing)**, `gate-hermetic: PASS`, 0 non-loopback attempts, 578 s. Loopback targets unchanged since Wave 0 (127.0.0.1:18210 ×3, :19999 ×1, :7420 ×2, :8545 ×9). Previous gate (end of 1.5): 1830 → +21 tests (the two new suites).
- After the gate, one test-only refactor (the scripted node's `this` alias → arrow functions, for `no-this-alias`): the observer suite re-run 7/7 (`w2a-after4`); no source changed after the gate.
- `pnpm version:check`: all packages at `0.12.0-rc.23`, no newer reference.
- lint: `sdk` back to the 2 pre-existing errors (`igra.ts:31`, `pskt/adapters/test-fake.ts:26`), `core`/`artifacts`/`toolkit` 0 errors (warnings only).

## 9. Status

Wave 2(a): IMPLEMENTED — §8 green. Next per the ratified order: (b) AUD-17/AUD-28 canonical planner; (c) AUD-19 pending-spend with mempool evidence; (d) AUD-18 real fee; (e) AUX-11; (f) T-A14b network narratives on the derived state; (g) N10.
