# Wave 1.4 + 1.5 ledger — synthetic authorization (Q2-B, N4, AUD-13) and evidence narratives (AUD-14, simulator + dev-server)

Order: REPRODUCE → TEST FAILING → MINIMAL FIX → TARGETED PASS → FULL REGRESSION.
Base: owner commit `5c2f0ec4f` (all of Wave 1.3) + the accepted B1/B1-bis/B2 security fixes (uncommitted). Version stays `0.12.0-rc.23`. No publish, no changesets, no dist-tag, no commits (owner does them).
Scope: Closure Pack D-Q2 (Q2-B), D-Q2.a (N4), IC-6′.1–5; Plan §3 "1.4 Vinculación firmado↔plan en simulador — AUD-13" and "1.5 Narrativas de evidencia (parte simulador y dev-server) — AUD-14 · T-A14a, T-A14c". Not touched: Wave 2 / Q4 / CONFIRMED semantics / TxObservation, T-A14b (network narratives, Wave 2), RPC endpoint normalisation (ARCHITECTURE_BLOCKED).

## 1. Finding / root cause (pre-1.4 tree)

| Label | Root cause |
|---|---|
| AUD-13 / IC-6′.1 | the simulator "signed" artifact carried NO authenticated reference to the plan it authorized: `sourcePlanId` (a label), `signedTransaction: { format: "simulated", payload: "simulated-signed-tx:<planId>" }`, `txId: simulated-<planId>-tx` — all label-derived |
| AUD-13 / IC-6′.2 | `signTxPlanArtifact` (accounts) never looked at the account: `--account` was neither validated against the plan's `from` nor recorded (T-B6: a wrong signer produced the same artifact); `simulate`/`send` resolved the parent by `lineage.parentArtifactId` (since 1.2) but never checked that the plan resolved is the plan authorized, nor the signer |
| IC-6′.3 | the only signer-related data (`signatureMetadata`) is in `V5_UNAUTHENTICATED` |
| IC-6′.4 / N4 (AUD-49) | two synthetic txId schemes: localnet `simtx_<32hex>` / `simtx_failed_<32hex>` (plan hash + state + daa, truncated to 128 bits) and SDK/accounts `simulated-<planId>-tx` (a label); multisig completion wrote `signature: "simulated-signature-of-<addr>"` (presented as a signature) |
| IC-6′.5 | nothing distinguished a legacy `format: "simulated"` artifact from a bound one: `send` executed both |
| IC-4′.4 (execution) | the plan resolved for a signed artifact was never re-checked for FULL scope at execution time |
| AUD-14 / SEC-I (simulator + dev-server) | `explain.ts` printed `Replay Result: deterministic reproduction successful` for every simulated artifact without running anything; `tx.ts` printed a fabricated `Replay ID: replay_<8>` and `Replay Status: deterministic reproducible`; the signed-path title said "broadcast successfully" even when `accepted` was false; dev-server `routes/artifacts.ts` `/explain` returned fixed `actions: ["Analyzed artifact signature", …]`, `policyChecks: [{Integrity: passed}]`, `deterministic: true`; `/replay` returned `passed` for anything the index did not flag as CORRUPTED (and compared against labels `tx-receipt` the index never stores, so real schemas always fell to "unsupported"); `routes/session.ts` `/replay` returned a fixed `passed, differences: 0` and `/diff-replay` a fixed `diverged` with invented classifications |

## 2. Reproduction BEFORE (targeted)

`w14-before.json` (3 new files, 18 tests): **2 passed / 16 failed** — `format: "simulated"` produced; no `authorization`; localnet ids `simtx_…`/`simtx_failed_…`; `createSimulatedSignedTxArtifact(plan, "kaspasim:qqmallory")` accepted (no `SIGNER_MISMATCH`); forged signer set / forged plan reference / legacy `format:"simulated"` / authorization over a LEGACY plan all executed (`OK`); 11 source files still built the old ids or formats. The two that passed before are the resolver-level guards from Wave 1.2 (T-C4b swapped plan, T-DBL) — kept as guards.

`w15-before-cli.json` (spawned CLI, pre-1.5 dist): **1 passed / 2 failed** — `explain` printed "deterministic reproduction successful", `tx send` printed a "Replay ID". The dev-server test could not be run against the old source in the same tree; its BEFORE is the fixed literals quoted in §1 (`policyChecks: passed`, `Analyzed artifact signature`, `/replay → passed`, `/session/replay → passed`), each of which the test asserts against.

## 3. Regression tests (written first)

| Test file | Property |
|---|---|
| `packages/artifacts/test/adversarial/wave1-4-synthetic-authorization.test.ts` | producer: `format: "synthetic-authorization"`, `authorization = { kind: "synthetic", planArtifactId, signers: [from] }`, `lineage.parentArtifactId = plan`, `txId = synthetic-<planArtifactId>` (64 hex), no `signatureMetadata`, no `simtx_`/`simulated-signed`/`"signature"` anywhere, strict FULL; every binding field is authenticated (identity changes and `checkArtifactIdentity` fails when any of them is altered); `SIGNER_MISMATCH` for a signer ≠ `from`; `PLAN_UNIDENTIFIED` for an unsealed plan; account object accepted; **T-N4 source scan**: no `packages/*/src` builds `simtx_`, `simulated-${…}-tx`, `format: "simulated"` or `simulated-signed-tx:` (allow-list: `resolve.ts`, which only CLASSIFIES old shapes for `NAMESPACE_REQUIRED` hints) |
| `packages/localnet/test/wave1-4-synthetic-txid.test.ts` | receipt `txId = synthetic-<planArtifactId>`, synthetic outpoints `synthetic-<id>:<n>`; `applySimulatedPlan` without explicit txId derives the same id (replay invariant); failed executions keep the single shape `synthetic-<64hex>` (deterministic, never `simtx_`) |
| `packages/sdk/test/adversarial/wave1-4-binding.test.ts` | SDK `sign` → synthetic authorization; `send` executes with the synthetic txId; **T-C4b** (the plan file swapped for a redirected, re-hashed plan → `send` refuses, localnet state and receipts unchanged); **T-B4** (a redirected + re-hashed plan is a new identity; the original authorization never applies to it: `PARENT_PLAN_MISMATCH`); **T-B6** (`sign(plan, "bob")` → `SIGNER_MISMATCH`; a forged signer set, re-sealed, → `SIGNER_MISMATCH` at execution, state unchanged); **T-B7** (authorization naming another plan → `AUTHORIZATION_PLAN_MISMATCH`, whichever field is forged); **IC-6′.5** (legacy `format:"simulated"` → `LEGACY_UNBOUND_SIGNED` from `send` AND `simulate`); **IC-4′.4** (a well-formed authorization over a LEGACY v4 plan is never executed: `PLAN_NOT_FULL`/`MIGRATION_REQUIRED`, no receipt written); **T-DBL** (second send executes nothing, same submission); **multisig** (threshold set is a synthetic authorization bound to the plan, signers authenticated, no `simulated-signature`, executes with the synthetic txId; a set excluding the plan's `from` → `SIGNER_MISMATCH`); **T-DET** (two fresh workspaces: identical plan, authorization, receipt identities and txIds) |
| `packages/cli/test/wave1-5-narratives-cli.test.ts` (spawned dist) | **T-A14a**: `explain` of a simulated receipt prints the computed identity check (`Authentication Scope FULL`, `Integrity verified: the body recomputes…`), states `Replay not run by explain` with the exact `hardkas replay verify <id>` command, `Consensus Validation NOT performed`, and nothing "successful"; `tx send` (simulator) prints the computed outcome and NO `Replay ID`, NO "deterministic reproducible", `Replay Status not run`, `Consensus Validated NO`; manipulated chain (tampered receipt file): `explain <id>` and `explain --tx <txId>` refuse (verified lookup), EXIT≠0, nothing "successful" |
| `packages/dev-server/test/wave1-5-narratives.test.ts` | **T-A14c**: `/explain` reports the COMPUTED integrity (`passed`, `authScope FULL`, `issues []`), claims nothing about signatures, no `deterministic` literal, `replay: not run…`, `replayable` true for a simulator receipt; `/replay` on a simulator receipt returns the SDK replay's verdict (`passed`, lineage valid, determinism verified, ≥3 artifacts scanned, no divergences); `/replay` on a plan → `unsupported` (never `passed`); manipulated chain (tampered row + file): `/explain` → `failed` + `ARTIFACT_HASH_MISMATCH`, `/replay` → `missing_dependency`/`diverged`, never `passed`; `/session/replay` and `/session/diff-replay/:id` → `unsupported`, no invented differences/classifications |

## 4. Minimal diff (files)

Artifacts / core:
- `packages/artifacts/src/signed-tx.ts`: `SYNTHETIC_AUTHORIZATION_FORMAT`, `SYNTHETIC_TXID_PATTERN`, `syntheticTxIdFor(planArtifactId)` (the ONE synthetic scheme, D-Q2.a), `authorizablePlanIdentity(plan)` (FULL identity or `PLAN_UNIDENTIFIED`/`MIGRATION_REQUIRED`), `createSimulatedSignedTxArtifact(plan, signer, ctx)` (signer must be the plan's `from` → `SIGNER_MISMATCH`; writes `authorization`, `signedTransaction { format: synthetic-authorization, payload: planArtifactId }`, `txId = synthetic-<id>`; no `signatureMetadata`), `checkSyntheticAuthorization(signed, plan?)` (pure IC-6′ check: `LEGACY_UNBOUND_SIGNED` / `AUTHORIZATION_INVALID` / `AUTHORIZATION_PLAN_MISMATCH` / `SIGNER_MISMATCH` / `PLAN_NOT_FULL`; single-sig: parent = plan and signers = [from]; multisig: entries `{ signer, kind: "synthetic" }` only, signers = entries = ⊆ requiredSigners, threshold met, `from` ∈ signers, descends from the plan; with plan: same identity, FULL, same transfer), `getBroadcastableSignedTransaction` refuses a synthetic authorization (`SYNTHETIC_NOT_BROADCASTABLE`, IC-6′.4 "never presented as a signature").
- `packages/artifacts/src/schemas.ts`: `SignatureEntrySchema` = real signature XOR synthetic marker; `SyntheticAuthorizationSchema` (strict); `SignedTxSchema.authorization` optional.
- `packages/artifacts/src/types.ts`: `SignedTxArtifact.authorization`, multisig entry `signature?`/`kind?`.
- `packages/artifacts/src/verify.ts`: IC-6′ coherence of a signed artifact carrying an authorization (`AUTHORIZATION_*`/`SIGNER_MISMATCH` as errors); a legacy artifact WITHOUT one stays intact (the executor refuses it, the verifier does not call it corrupt).
- `packages/artifacts/src/validate.ts`: legacy validator accepts `synthetic-authorization` (keeps `simulated` as a recognised legacy shape).
- `packages/artifacts/src/store.ts`: comment only (`simtx_failed_*` → `synthetic-<64 hex>`).
- `packages/core/src/corruption.ts`: `AUTHORIZATION_INVALID`, `AUTHORIZATION_PLAN_MISMATCH`, `SIGNER_MISMATCH`, `PLAN_NOT_FULL`.

Localnet:
- `packages/localnet/src/transactions.ts`: `generateDeterministicTxId(plan)` = `syntheticTxIdFor(plan identity)` (no state/daa in the id: same plan = same txId, which is the replay invariant, and a plan's inputs are spent by its execution so the id cannot be produced twice); failed executions: `synthetic-<sha256(failure context)>` (64 hex; never the plan's id, so a failed diagnostic cannot collide with the executed transaction's id; never `simtx_`).

Accounts / testing:
- `packages/accounts/src/signer.ts`: simulator branch passes `account ?? plan.from.address` to the producer (the account is validated and recorded; without one the plan's `from` is the authorizing identity).
- `packages/accounts/src/types.ts`: `SignTxPlanResult.signedTransaction.format` = `hex | synthetic-authorization | unknown`.
- `packages/testing/src/simulated-tx-plan-signer.ts`: synthetic authorization (no payload string presented as a signature).
- `packages/testing/src/matchers.ts`: `toHaveValidTxId` = `synthetic-<64 hex>` | 64 hex.

SDK:
- `packages/sdk/src/tx.ts`: `sign` multisig first signature: `from` must be among `requiredSigners`, binds to `authorizablePlanIdentity(plan)`, entries `{ signer, kind: "synthetic" }`, `authorization` in the body; append: requires the partial's authenticated `authorization` (else `LEGACY_UNBOUND_SIGNED`), carries `planArtifactId` unchanged, completion requires `from` ∈ signers and writes `format: synthetic-authorization` + `txId = synthetic-<planArtifactId>`. `simulate`: structural binding check BEFORE anything else (so the refusal code is the binding code), explicit plan must be the plan the authorization names, plan resolved ONLY by `authorization.planArtifactId` (verified store lookup), then the full binding check against the resolved plan (FULL identity, signer = `from`, same transfer) → `txId` from the binding; plan targets: `txId = synthetic-<plan identity>`. `send`: `isSimulated` computed first; in the simulator the structural binding check runs before verification; real path unchanged except that `getBroadcastableSignedTransaction` now refuses synthetic authorizations. `status()`: `synthetic-` scheme.

CLI (Wave 1.5):
- `packages/cli/src/commands/explain.ts`: intro "local simulated execution"; `Integrity` = the resolver's computed scope; `Replay` = "not run by explain; run `hardkas replay verify <id>`" (simulator); `Projection Layer` no longer asserts an indexing that may not have happened. Network strings (`performed by remote node`, `network state dependent`) untouched — T-A14b, Wave 2.
- `packages/cli/src/commands/tx.ts`: both human blocks: no `Replay ID`, `Replay Status: not run (hardkas replay verify <artifactId>)` (simulator), `Execution Scope: local simulated execution`, `Projection` hedged; signed-path title follows `result.accepted` (no "broadcast successfully" on a rejected submit — same rule the flow path already had). `Consensus Validated: YES` for the network branch untouched — T-A14b, Wave 2.
- `packages/cli/src/runners/tx-send-runner.ts`: fabricated `replayId` removed from the runner result.

dev-server (Wave 1.5):
- `packages/dev-server/src/routes/artifacts.ts`: `/explain` computes `verifyArtifactIntegritySync(payload, { strict: false })` and reports `policyChecks: [{ Integrity, status, authScope, issues }]`, actions = what was done (hash recomputed, schema validated, lineage reference collected), warnings from the computed result, `executionMode`, `replay: not run…`, `replayable` for simulator receipts; `deterministic: true` and "Analyzed artifact signature" removed. `/replay`: receipts only (real schema strings; others → `unsupported` with the reason); verdict = `sdk.replay.verify({ artifactId })` mapped to `passed | unsupported (REPLAY_MODE_UNSUPPORTED, REPLAY_LEGACY_AUTH_SCOPE) | missing_dependency (lineage invalid) | diverged`, with lineage/determinism/contamination/artifactsScanned/divergences/error from the replay.
- `packages/dev-server/src/routes/session.ts`: `/replay` and `/diff-replay/:id` → `unsupported` with the reason and the endpoint that computes a verdict.

Re-based existing tests (same properties, new model): `accounts/test/signer.test.ts` (sealed plan, synthetic expectations), `artifacts/test/signed-tx-artifact.test.ts`, `artifact-handle.test.ts` (a real-looking txId lives on a NON-synthetic signed), `wave11-resolver-exact-id`, `wave6-lineage-cycle-safety`, `wave1-1-canonical-v5`, `wave1-1-hash-version-gate` (`signedOf` helper; the v4 status-flip sample is a plain unbound signed, as rc.22 wrote), `wave1-1-producers-immutability`, `wave1-2-references`, `wave1-2-resolver` (all: signer = `plan.from.address` instead of a payload string), `wave1-3-b1-parent-migrated-forge` + `cli/test/wave1-3-verify-cli` (the "v5 child of a legacy plan" is now hand-sealed as an unbound signed, since the producer refuses to authorize a LEGACY plan — IC-4′.4), `sdk/test/hardening.test.ts` (VULN-03 through the real lifecycle; VULN-05 on the real-broadcast branch + the simulator refusal `LEGACY_UNBOUND_SIGNED`), `sdk/test/multisig.test.ts` (synthetic expectations), `sdk/test/adversarial/wave1-3-b2-*` and `wave1-3-producers` (`asBroadcastable`: the real-broadcast branch is exercised with a non-synthetic re-issue because a synthetic authorization is never broadcast), `testing/test/golden/reproducibility.json` (`simulatedTxReceipt` regenerated: only the txId scheme changed; the other 7 golden hashes are unchanged).

## 5. Derived decisions (for the security review)

1. **Failed simulated executions** carry `synthetic-<sha256(failure context)>`: single shape (N4), deterministic, never the plan's identity (a failed diagnostic must not collide with the executed transaction's id), never persisted by the SDK (it throws).
2. **Single-authorization signer**: without `--account`, the plan's `from` is the authorizing identity (there is no secret in the simulator; the binding is by identity). With an account, its address MUST equal `from` (`SIGNER_MISMATCH`).
3. **Multisig**: `from` must be among `requiredSigners` at the first signature and among the completing signers; entries are `{ signer, kind: "synthetic" }` (nothing presented as a signature); a legacy partial (no authenticated `authorization`) cannot be completed (`LEGACY_UNBOUND_SIGNED`).
4. **Verifier vs executor**: the verifier flags an INCOHERENT authorization (errors) but a legacy artifact without one is intact (`LEGACY_UNBOUND_SIGNED` is the executor's refusal, not corruption).
5. **Binding check ordering**: `send`/`simulate` decide the binding code BEFORE strict verification so the refusal is the binding code (`LEGACY_UNBOUND_SIGNED`, `AUTHORIZATION_PLAN_MISMATCH`, …), then verify, then resolve the plan by the authenticated `planArtifactId` only, then decide `SIGNER_MISMATCH`/`PLAN_NOT_FULL` against the resolved plan.
6. **Never broadcast**: `getBroadcastableSignedTransaction` refuses `synthetic-authorization` / `authorization.kind = synthetic` (`SYNTHETIC_NOT_BROADCASTABLE`), so a synthetic authorization sent with an explicit RPC URL never reaches a node.
7. **AUD-14 boundaries**: only the simulator narratives and the dev-server routes named by the row were changed; the network narratives (`Consensus Validated: YES`, `performed by remote node`) are T-A14b and stay for Wave 2 (receipt state model, Q4). The dev-server `/session/snapshot` and `/time-travel` stubs (fake mutations, not evidence narratives) were left as found and are noted here.
8. **Dev-server replay is real**: `POST /api/artifacts/:id/replay` runs `sdk.replay.verify` in the workspace (`HARDKAS_ROOT` or cwd) and writes the replay report the SDK writes, exactly like `hardkas replay verify`.

## 6. Verification

| Run | Result |
|---|---|
| `w14-before` (3 new files) | 2 passed / 16 failed (BEFORE) |
| `w14-after2` (3 new files) | **18 / 18** |
| `w14-fallout1` (artifacts, localnet, sdk, testing, accounts, query, query-store, tx-builder, simulator: 439 files) | 970 passed / 59 failed / 5 skipped → all 59 are the re-bases listed in §4 |
| `w14-fallout2` (16 re-based files) | 134 / 135 → last expectation fixed → included below |
| `w14-fallout3` (accounts signer, reproducibility, cli, dev-server, core, config: 227 files) | **478 passed / 0 failed / 22 skipped** |
| `w15-before-cli` (T-A14a on the pre-1.5 dist) | 1 passed / 2 failed (BEFORE); T-A14c 5/5 on the new source |
| `w15-after-cli2` (T-A14a on the rebuilt dist + T-A14c) | **8 / 8** |
| `pnpm typecheck` (after 1.4 and again after 1.5) | 0 errors (55/55 tasks); native `.node` restored with `git checkout --` |
| `pnpm version:check` | 4663 files scanned, all at `0.12.0-rc.23`, no newer reference |
| `pnpm lint` | 2 errors, both pre-existing and untouched (`sdk/src/igra.ts:31` no-constant-condition, `sdk/src/pskt/adapters/test-fake.ts:26` prefer-as-const); warnings only elsewhere |
| Full hermetic gate `w14-15-full1` | **1830 passed / 0 failed / 28 skipped, PASS** (see §7) |

## 7. Full gate

`w14-15-full1` (`scripts/gate-hermetic.mjs --home <FRESH_SUPPORTED_TOOLCHAIN_BASELINE>`, CLI dist rebuilt beforehand): **828 files / 1858 tests / 1830 passed / 0 failed / 28 skipped (the same pre-existing skips)**, `gate-hermetic: PASS`, 0 non-loopback attempts, EXIT 0, 610 s. Loopback targets observed (all pre-existing, noted since Wave 0): 127.0.0.1:18210 ×3, :19999 ×1, :7420 ×2, :8545 ×9. Previous full gate (end of 1.3): 1790 tests → +68 tests (the 5 new files) with the 16 re-bases and no regressions.

## 8. Status

Wave 1.4: IMPLEMENTED (Q2-B, N4, AUD-13 regressions T-C4b/T-B4/T-B6/T-B7/T-DBL/T-DET + IC-6′.5 + IC-4′.4 + multisig). Wave 1.5: IMPLEMENTED (AUD-14 simulator + dev-server, T-A14a/T-A14c). Nothing committed. Version `0.12.0-rc.23`. AUD-02 stays BLOCKED.

STOP: `WAVE_1_SECURITY_REVIEW` — `WAVE_0_1_IMPLEMENTATION_COMPLETE — PENDING ADVERSARIAL RE-AUDIT`.
