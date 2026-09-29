# Wave 1.3 ledger — IC-1′…IC-7 completion, migration, SubmissionReceipt (R-iii part 1)

Order: REPRODUCE → TEST FAILING → MINIMAL FIX → TARGETED PASS → FULL REGRESSION.
Base: Wave 0 + 1.1 + 1.2 working tree (uncommitted). Version stays `0.12.0-rc.23`. No publish, no changesets, no dist-tag.
Scope: Closure Pack §5 "1.3: v5 B′ (already in 1.1), linaje (i′) (1.1), SubmissionReceipt, N1 (hash), N7 (digests), N8, N13 y migración" + the IC-4′ items deferred from 1.1 (§7 of the 1.1 ledger: AUD-07, AUD-08, AUD-12, AUX-01, AUX-03, AUX-08, D-Q20) + AUD-38 + IC-7.1/7.3/7.4.

## 1. Finding / root cause (audit, Closure Pack, Impact Studies)

| Label | Root cause in the pre-1.3 tree |
|---|---|
| AUD-08 / IC-4′.1 / T-P6 | `verify.ts` returned `ok: true` for any object with `schema: hardkas.replayReport.v1` before any check; the replay report producer never sealed a report (no `hashVersion`, no `contentHash`) |
| AUD-07 / IC-4′.6 / T-A07 | `artifact-verify-runner.ts` wrote `{ ok: true, … }` for a single file whatever the result, and returned without a non-zero exit |
| AUD-12 / T-A12a | the CLI ran `verifyArtifactIntegrity(file)` WITHOUT `{ strict }` in both single and recursive modes: the strict gate (`MIGRATION_REQUIRED`) never fired from `hardkas verify` |
| AUX-08 / D-Q20 | `hardkas verify` took no positional argument and commander silently ignored extras: `hardkas verify receipt.json` verified the whole store with EXIT 0 |
| AUX-01 | `--deep` was declared, documented ("deep validation of signatures and causality") and never read |
| AUX-03 / D-Q21 | non-strict results did not show the authentication scope in the CLI; the JSON verdict was decoupled from the result |
| IC-7.3 / IC-4′.5 | no verifier refused a top-level `artifactId` on a version-5 artifact; producers still wrote one: the workflow (`artifactId: workflowId`), Silver CLI records (`<prefix>-<16hex>` label), the Silver bookkeeping simulator (`silverdeploysim-…`), `artifact create` (random `art_…`) |
| N6 / IC-7.5 | the workflow producer hashed with `hashVersion: 1` (legacy exclusions of `status`, `lineage`, `events`…) and stored its correlation label as identity |
| IC-1′.7 / N7 (digest half) | domain digests (`stateHash`, `utxoSetHash`, `accountsHash`, intent digests, synthetic tx ids, ZK corpus digests, vProgs inspection digest, bridge prefix mining) used `calculateContentHash(x, 4)`, i.e. the artifact canonical form WITH name exclusions at any depth (a `status`/`createdAt`/`events` key inside the digested value silently vanished) |
| IC-7.4 | `workflowId` had two derivations (plan intent in `tx-plan.ts`, step intent in `workflow.ts`/`tx-flow.ts`) plus two ad-hoc builders (`wf_<name>_<time>` in `workflow-create-runner.ts`, `wf_<time>` in core's ambient `RuntimeContext.ids.workflow`) |
| IC-7.1 | no registry of identifier categories; nothing checked that `planId`/`txId`/`stateHash` are not identities |
| N8 / T-VER | `observe/index.ts:191` carried the product version as a string literal |
| N13 / IC-4′.7 | `generateMigrationReceipt` built `lineageId = ("migration" + oldHash).padEnd(64,"0").slice(0,64)` (non-hex) and trusted the claimed `oldHash`/`newHash` without recomputing |
| D-Q1.f / IC-4′.7 (whitewash) | `migrateArtifactPayload` copied every legacy field (including v4-unauthenticated `artifactId`, `status`, nested `contentHash`…) into the re-sealed v5 body as if authenticated; no `--to 5` entry point existed; the SDK `migrate()` only re-versioned schemas |
| R-iii part 1 / IC-2′.2 / IC-2′.8 | a real `send` wrote a `hardkas.txReceipt` with `status: "submitted"` (a stored post-send state); decision sites read `receipt.status` regardless of the authentication scope (`tx-send-runner` `accepted`, `tx.ts --track`, `tx-flow` event status, query replay divergences/invariants, replay verdict) |
| Silver simulator | `packages/simulator` kept its OWN canonicaliser (`CURRENT_HASH_VERSION = 4`, exclusions `{contentHash, artifactId, hashVersion, createdAt, hardkasVersion, status}` at any depth), non-hex lineage labels, trusted a claimed `contentHash` on input plans |
| AUD-38 | `check:artifacts` pointed at `../artifacts/test/fixtures/valid` (non-existent from the root) and the three "valid" fixtures were `hardkasVersion 0.5.4-alpha`, no `hashVersion`, placeholder ids |
| N1 (nested authentication) | closed by v5 itself (1.1): Silver references are nested → authenticated; 1.3 moves the Silver records to v5 so the property holds for records written from now on (T-N1b) |

## 2. Reproduction BEFORE (targeted, `w13-before.json`, `w13-before2-replay-verdict.json`)

`w13-before`: 64 tests, **12 passed / 52 failed** across the 10 new files (one file failed to load: `silver-records.js` did not exist). Each failure is the audited property: ReplayReportV1 verified `ok` without a hash, v5 artifacts with a top-level `artifactId` accepted, no `domainDigest`/`deriveWorkflowId`/`IDENTITY_CATEGORIES`/`migrateArtifactToHashVersion` exports, 9 sources with numeric literal versions, 3 local canonicalisers, 4 `wf_` builders, the workflow at `hashVersion 1`, a real `send` producing no submission, `artifact verify --json` `ok:true` on a broken hash, `hardkas verify` green on a legacy store, `--deep` accepted, legacy `status` deciding replay divergences, Silver simulator receipts at v4 with a local canonicaliser and `artifactId`.

`w13-before2-replay-verdict`: 1 failed — `sdk.replay.verify` returned `passed: true` for a hashVersion-4 twin of a current receipt (its `status` and state digests were never authenticated).

## 3. Regression tests (written first)

| Test file | Property |
|---|---|
| `packages/artifacts/test/adversarial/wave1-3-verify-fail-closed.test.ts` | T-P6 (ReplayReportV1 without hash NOT ok, tampered → `ARTIFACT_HASH_MISMATCH`, sealed → FULL), unknown schema → error (control), IC-7.3 `FORBIDDEN_IDENTITY_FIELD` on v5 (both modes, verifier and resolver), legacy v4 with `artifactId` stays LEGACY (listed as unauthenticated), control without the field |
| `…/wave1-3-domain-digest.test.ts` | IC-1′.7: `domainDigest` exists with its own version, NO exclusions (every excluded name changes it, bigint typed, key order irrelevant), legacy digest = frozen canonical v4, `domainDigestVersionFor` selects by declared hashVersion and fails closed; source scans: no numeric-literal `calculateContentHash`/`canonicalStringify` version, no local canonicaliser or `CURRENT_HASH_VERSION`, no `wf_` builder outside `deriveWorkflowId`; IC-7.4: single derivation over typed intents, plan default `workflowId` = that derivation, invalid intent → `WORKFLOW_INTENT_INVALID` |
| `…/wave1-3-migration.test.ts` | D-Q1.f: `migrateArtifactToHashVersion` re-issues a v4 plan as strict-FULL v5, source object untouched, `artifactId` → `legacyClaims` (never in the body), labels recomputed, lineage rebuilt from the verified source (`verifyLineage` ok), N13 receipt (hex lineage, FULL, recomputed hashes), tampered source → `MIGRATION_SOURCE_INVALID`, undeclared version → `HASH_VERSION_INVALID`, v5 → `MIGRATION_NOT_NEEDED`, `--to 4` → `MIGRATION_TARGET_UNSUPPORTED`, legacy receipt with unauthenticated required `status` → `MIGRATION_UNVERIFIED_REQUIRED_FIELDS` (refused, not whitewashed), the 0.1.0→1.0.0-alpha schema migration seals through the same rule, receipt generator recomputes |
| `…/wave1-3-identity-categories.test.ts` | IC-7.1: closed category set, Zod introspection over every exported schema (identifier-shaped leaf keys must be registered), IC-7.2 (CONTENT is the only identity category), registry closed |
| `packages/localnet/test/wave1-3-domain-digests.test.ts` | current digests = `domainDigest`, legacy reachable only by explicit `hashVersion ≤ 4`, v5 snapshot FULL, v4 snapshot with legacy digests verifies, v5 snapshot carrying legacy digests fails (no fallback), T-N7: v5 receipt replays clean, v4 receipt replays with the legacy digest (no false preStateHash divergence), v5 receipt with legacy digests diverges |
| `packages/sdk/test/adversarial/wave1-3-producers.test.ts` | N6 workflow v5 without `artifactId`, strict FULL, `{artifact}`/`{workflow}` warm and cold; IC-7.4 determinism; R-iii submission on a real send (authenticated ref/txId/result, no post-send state, `rpcUrl` unauthenticated, no `endpoint`, `{tx}` lookup, cold), rejected submit recorded, two distinct submissions per txId → `RECEIPT_AMBIGUOUS_CONFLICT`; SDK `migrate` (source file byte-identical, receipt, strict FULL of both, `MIGRATION_NOT_NEEDED`) |
| `packages/sdk/test/adversarial/wave1-3-replay-legacy-verdict.test.ts` | IC-4′.4: replay verdict never `passed` for a LEGACY receipt → `REPLAY_LEGACY_AUTH_SCOPE` |
| `packages/query/test/wave1-3-legacy-status.test.ts` | IC-2′.8: divergences/invariants decide on `status` only for FULL; legacy → `insufficient-evidence` / `authScope: LEGACY`, invariants not established |
| `packages/simulator/test/wave1-3-silver-simulator-v5.test.ts` | receipts sealed by THE canonicaliser at v5, FULL, hex lineage, no `artifactId`, `status` authenticated, synthetic ids = domain digests, claimed plan `contentHash` checked (`SILVERSCRIPT_PLAN_HASH_MISMATCH`), legacy v4 plan accepted under its version |
| `packages/cli/test/wave1-3-cli-helpers.test.ts` | `sendOutcome` (submission result / FULL receipt status / LEGACY never decides / tampered decides nothing), next steps + explanation for a submission, `why` narrative for a submission, Silver records v5 without `artifactId` + derived label + T-N1b (nested reference authenticated), `artifact create` without `artifactId`, documented `hardkas verify` contract (no deep flag, accepted targets, strict limitation) |
| `packages/cli/test/wave1-3-verify-cli.test.ts` (spawned dist) | AUD-07 (`ok:false` + EXIT≠0 + `ARTIFACT_HASH_MISMATCH`, human mode too), AUX-03 (FULL/LEGACY scope in JSON, `--strict` → `MIGRATION_REQUIRED`), AUD-12 (`hardkas verify` green on v5 store, red with a legacy artifact), AUX-08/D-Q20 (`verify <path>` verifies THAT path, excess args usage error, outside path → `ARTIFACT_PATH_OUTSIDE_WORKSPACE`), AUX-01 (`--deep` unknown option), D-Q1.f CLI (`artifact migrate --to 5`: source untouched, artifact + receipt in the store, workspace green afterwards, `MIGRATION_NOT_NEEDED`, `MIGRATION_TARGET_UNSUPPORTED`), AUD-38 (valid corpus verifies strict; root script path) |

## 4. Minimal diff (files)

Core / artifacts:
- `packages/artifacts/src/canonical.ts`: internal unexcluded serializer mode (`canonicalStringifyUnexcluded`), never a declarable hash version (rejected by `canonicalStringify`).
- `packages/artifacts/src/domain-digest.ts` (new): `domainDigest` (v1, no exclusions), `legacyDomainDigest` (frozen canonical-v4 form, legacy material only), `domainDigestVersionFor`/`domainDigestForHashVersion` (algorithm follows the DECLARED hashVersion; invalid → `HASH_VERSION_INVALID`).
- `packages/artifacts/src/workflow-id.ts` (new): typed `WorkflowIntent` (`transfer` | `steps`), `deriveWorkflowId` = `wf_` + 16 hex of the domain digest (IC-7.4 / IC-1′.5); `tx-plan.ts` delegates.
- `packages/artifacts/src/identity-categories.ts` (new): `IDENTITY_CATEGORIES` registry (7 closed categories), `identityCategoryOf`, `isIdentityCategory` (CONTENT only).
- `packages/artifacts/src/verify.ts`: ReplayReportV1 bypass removed; `FORBIDDEN_IDENTITY_FIELD` for v5; `TxSubmissionSchema`/`ReplayReportSchema` cases; submission semantics (`SUBMISSION_REFERENCE_INVALID|MISMATCH`, `SUBMISSION_STATE_FORBIDDEN`); parent absence tolerated ONLY under a FULL MigrationReceipt certifying the link (`PARENT_MIGRATED` / `MIGRATION_SOURCE_ABSENT`, info); MigrationReceipt exempt from `MISSING_WORKFLOW_ID`/`MISSING_ASSUMPTION_LEVEL`.
- `packages/artifacts/src/resolve.ts`: `checkArtifactIdentity` refuses a v5 top-level `artifactId`; `tx` namespace answers with `hardkas.txSubmission.v1` too.
- `packages/artifacts/src/migration.ts`: `verifyMigrationSource` (declared version, recomputed identity, lineage self-reference), `sealFromVerifiedSource` (strip unauthenticated material paths → `legacyClaims { sourceHashVersion, sourceArtifactId, verified:false, note, fields }`, drop `artifactId`, recompute labels, lineage rebuilt from the verified source, strict post-condition), `migrateArtifactToHashVersion` (D-Q1.f), `migrateArtifactPayload` sealed through the same rule (+ execution derived from mode/networkId for legacy schemas), `generateMigrationReceipt` (recomputed hashes, hex lineage, N13), `MigrationError` codes.
- `packages/artifacts/src/schemas.ts`, `types.ts`: `TxSubmissionSchema`/`TxSubmissionArtifact` (authenticated `signedArtifactId`, `txId`, `submitResult`; unauthenticated `submittedAt`, `rpcUrl`; NO `endpoint`, NO status), `ReplayReportSchema`.
- `packages/artifacts/src/lineage.ts`: transitions `signedTx → txSubmission.v1`, `txSubmission.v1 → migrationReceipt.v1`.
- `packages/artifacts/src/store.ts`: submissions live under `receipts/`. `index.ts`: new exports.
- `packages/core/src/registry.ts` (+`TxSubmissionV1`), `core/src/index.ts` (`artifactTypeSchema` +`txSubmission.v1`), `core/src/corruption.ts` (+`FORBIDDEN_IDENTITY_FIELD`), `core/src/runtime-context.ts` (`IdProvider.workflow` optional; the ambient `wf_<time>` generator removed).

Producers / consumers:
- `packages/localnet/src/{snapshot,transactions,replay}.ts`, `types.ts`: digests through the domain-digest function with the algorithm selected by the declared hashVersion (`{ hashVersion }` option; `applySimulatedPlan({ digestHashVersion })`; `verifyReplay` uses the ORIGINAL receipt's version), replay report sealed by its producer.
- `packages/sdk/src/tx.ts`: real `send` → `hardkas.txSubmission.v1` (frozen, one pass, lineage child of the signed), refuses to broadcast an unidentifiable signed artifact (`SUBMISSION_UNIDENTIFIED_SIGNED`), records a rejected submit (`accepted:false`, `error`), result `submission` + `submitted` from the authenticated result; `findExistingSubmission` decides on `submitResult.accepted` for submissions.
- `packages/sdk/src/replay.ts`: `REPLAY_LEGACY_AUTH_SCOPE` (verdict never accepts LEGACY).
- `packages/sdk/src/workflow.ts`: v5, no `artifactId`, `deriveWorkflowId({kind:"steps"})`. `observe/index.ts`: `HARDKAS_VERSION` (N8). `zk.ts`: explicit `legacyDomainDigest` for the shipped corpus manifests. `vprogs.ts`: `domainDigest`. `artifacts-manager.ts`: `migrate(target, { to, migrationId })` = D-Q1.f (raw contained file or lookup; both artifacts written; `MigrationError` → `HardkasError(code)`).
- `packages/bridge-local/src/prefix-miner.ts`: `domainDigest`.
- `packages/query/src/adapters/replay-adapter.ts`, `types.ts`: `authScopeOf` gate; `insufficient-evidence` divergence kind; invariants carry `authScope`, status-based invariants not established outside FULL.
- `packages/simulator/src/silver-simulator.ts` (+ `@hardkas/artifacts` workspace dependency in `packages/simulator/package.json`, lockfile importer only): THE canonicaliser at v5, `artifactHash` = recomputed under the declared version with claim check, synthetic ids = `domainDigest`, hex lineage, no `artifactId`, `HARDKAS_VERSION` fallback.
- CLI: `commands/verify.ts` (`[path]`, no `--deep`, strict, contained), `runners/artifact-verify-runner.ts` (AUD-07/AUD-12/AUX-03/D-Q20), `commands/artifact.ts` + `runners/artifact-migrate-runner.ts` (`artifact migrate <path> --to 5`), `program.ts` (`allowExcessArguments(false)`), `runners/next-steps.ts` (`sendOutcome`), `runners/why-narrative.ts` (submission), `runners/silver-records.ts` (new) + `commands/silver.ts` (records v5, derived label), `runners/artifact-create-runner.ts`, `commands/simulator-silver.ts` (derived file label), `runners/tx-send-runner.ts`, `commands/tx.ts` (verdict from `sendOutcome`; `TX_SUBMISSION_REJECTED` EXIT 1), `runners/tx-flow.ts` (`deriveWorkflowId`, event status from the authenticated outcome, event `artifactId` = contentHash), `runners/kaspa-wallet-runner.ts` (plan sealed with `finalizeTxPlanIdentity` instead of an ad-hoc `planId` digest and a fake `contentHash`), `runners/workflow-create-runner.ts` (`deriveWorkflowId`).
- Docs: `apps/docs/docs-data/cli-semantics.ts` (`hardkas verify` contract), `apps/docs/docs/reference/cli/{verify,artifact}.md` (hand-mirrored), `docs/reference/cli.md` + `cli.generated.json` regenerated with `pnpm --filter @hardkas/cli docs:generate-cli` (the regeneration also brings in the Wave 1.2 `explain`/`why` deltas that had not been regenerated).
- Fixtures: `packages/artifacts/test/fixtures/valid/{tx-plan,signed-tx,snapshot}.valid.json` regenerated by the real producers (`gen-valid-fixtures.mts`, fixed clock 2026-09-25T12:00:00Z; plan `e260046f…`, signed `519f1627…`, snapshot `b77bfe66…`); root `package.json` `artifact:fixtures` path fixed (`packages/artifacts/test/fixtures/valid`). Golden `packages/testing/test/golden/reproducibility.json`: only `simulatedTxReceipt` moved (`5eb24c88…` → `82cf2531…`, see §8.11).

## 5. Targeted AFTER

`w13-after1` (artifacts only, first fix batch): 29/35. `w13-after2` (all 16 files): 99/109 — the 10 remaining were three wrong test assumptions (see §5b), the golden, and one real gap (`PARENT_MISSING` after migration) fixed in `verify.ts`. **`w13-after3`: 109 / 109 passed**, hermetic PASS, 0 network attempts (16 files: the 11 new suites + the 5 re-based suites below).

## 5b. Fallout and re-based suites (justification per file)

| File | Cause under the new contract | Resolution |
|---|---|---|
| `localnet/test/wave1-1-snapshot-identity.test.ts` | its third test asserted the 1.1 *provisional* pin ("digests = canonical v4"), which the same test's comment declared temporary until IC-1′.7 | asserts `domainDigest` now; legacy digest reachable only by explicit `hashVersion: 4`; the v4-snapshot test builds legacy digests explicitly |
| `query/test/replay-adapter.test.ts` | fixtures had no `hashVersion`/`contentHash` (NONE scope): status-based divergences are no longer judged for them (IC-2′.8) | fixtures sealed under v5; the tested properties (status-mismatch detection, invariants) are unchanged |
| `sdk/test/migration.test.ts` | fixture declared no `hashVersion` and a non-hex lineage: unverifiable, so it cannot be a migration source (IC-4′.2) | explicit v4 legacy plan exactly as rc.22 wrote it; assertions kept and `hashVersion 5` on the result added |
| `simulator/test/silver-simulator.test.ts` | unchanged; passes with the v5 sealing (its inputs declare `hashVersion: 4`, accepted under their version) | — |
| `testing/test/reproducibility.test.ts` | golden `simulatedTxReceipt` moved (§8.11) | golden regenerated with the before/after documented (`golden-report-w13.json`) |
| three of my own assertions | (a) `deriveWorkflowId` vs canonical v4 compared on an intent WITHOUT excluded names (the forms coincide); (b) commander exits 1, not 2, on excess arguments; (c) localnet state without excluded names digests identically under both algorithms | (a) compared on an intent carrying `status`; (b) `not.toBe(0)`; (c) the localnet suites inject an excluded name (`status`) into the digested data so the algorithms provably differ — and the ledger records the consequence: **plain localnet snapshots and receipts keep their digest values** (no excluded name occurs in that data), so no on-disk snapshot moved |

Two spawned-CLI hygiene points (from 1.2) applied: dist rebuilt before the targeted and full gates (`pnpm typecheck` = turbo `^build`; pskt-native binary restored after each build).

## 6. Derived decisions (not literal in the Closure Pack; flagged for the adversarial re-audit)

1. **Domain-digest algorithm selection**: keyed by the DECLARED `hashVersion` of the artifact that carries the digest (`≤ 4` → frozen canonical-v4 form, `5` → `domainDigest` v1); no `digestVersion` field is written. Alternative: an explicit `digestVersion` field on snapshots/receipts (adds a field to two schemas; rejected as not minimal). Consequence measured: for the plain localnet data shape the two algorithms give the same value, so existing snapshot/receipt digests did not move; they differ only when a key the artifact form excludes (`status`, `createdAt`, `events`…) appears inside the digested value — which is exactly the N7 defect.
2. **`workflowId` derivation** (IC-7.4): ONE function over a typed intent (`kind: "transfer"` for plans, `kind: "steps"` for declarative workflows/flows). The `kind` is part of the digest. The ambient `RuntimeContext.ids.workflow()` generator (`wf_<time>`) was removed (unused in src; `IdProvider.workflow` is now optional), and `workflow create` (quarantined command) derives from its template. Consequence: workflow ids of declarative runs changed vs 1.2 (correlation labels only; the plan intent digest also moved because it now carries `kind`).
3. **Migration without whitewash**: unauthenticated material paths are moved to `legacyClaims` (authenticated as *claims*, `verified: false`); the re-issued artifact must verify strict or nothing is issued; when a stripped field is REQUIRED by the schema (`status` of a legacy receipt) the migration is **refused** (`MIGRATION_UNVERIFIED_REQUIRED_FIELDS`) rather than inventing a value. Lineage of the re-issue: parent = verified source; `lineageId`/`rootArtifactId` carried only when the source version authenticated its lineage (v4), else the source is the root. `execution` for 0.1.0-schema plans/signed/receipts is derived from the authenticated `mode`/`networkId` (a deterministic function, not a claim).
4. **Parent absent after migration**: strict semantics tolerate a missing `lineage.parentArtifactId` ONLY when a FULL-scope MigrationReceipt in the store certifies exactly that link (`oldHash` = parent, `newHash` = this artifact), or when the artifact IS that receipt; reported as info (`PARENT_MIGRATED` / `MIGRATION_SOURCE_ABSENT`). Without it the workflow "migrate, then remove the legacy file so `hardkas verify` is green" was impossible. A MigrationReceipt is also exempt from `MISSING_WORKFLOW_ID`/`MISSING_ASSUMPTION_LEVEL`.
5. **SubmissionReceipt shape** (`hardkas.txSubmission.v1`): authenticated `signedArtifactId` (= `lineage.parentArtifactId`, checked), `txId`, `submitResult {accepted, transactionId?, error?}`; unauthenticated `submittedAt`, `rpcUrl`; **no `endpoint` field** — the normalisation is ARCHITECTURE_BLOCKED (Closure Pack says only "sin credenciales, sin query"), so the endpoint provenance of a submission is NOT authenticated yet; when ratified, `endpoint` becomes an authenticated field and submissions produced after that get new identities. A rejected submit is recorded (`accepted:false`) and `send()` returns `submitted:false` instead of throwing; the CLI exits 1 with `TX_SUBMISSION_REJECTED` after printing. A real `send` refuses to broadcast a signed artifact with no verifiable identity (`SUBMISSION_UNIDENTIFIED_SIGNED`): there would be nothing to record the submission against. `send().receipt` keeps the (now union-typed) alias for consumers; `submission` is the typed field. The simulator path is untouched (Wave 1.4 / Wave 2).
6. **Legacy status decisions** (IC-2′.8 / IC-4′.4) wired at: `sendOutcome` (CLI verdicts, `--track`, flow event status), query replay divergences/invariants (`insufficient-evidence`, `authScope`), replay verdict (`REPLAY_LEGACY_AUTH_SCOPE`), `findExistingSubmission` (already FULL-only). Left as display-only (not decisions) and recorded: dev-server routes (`replay.ts`, `overview.ts`, `observability.ts`, `transactions.ts`) and `tx-builder verifyTxReceiptSemantics` (`accepted && !txId` consistency check).
7. **IC-7.1 registry** names: `networkId`/`chainId`/`branchId`/outpoint `id` classified NETWORK (network-side designators), `networkProfileId` CORRELATION (a profile's own name; the artifact is referenced by `networkProfileRef`), `oldHash`/`newHash`/`*ArtifactHash`/`policyRef`… CONTENT. The registry is closed (unknown name → undefined).
8. **`hardkas verify [path]`** containment applies to `hardkas verify` only (D-Q20 text); `artifact verify <path>` keeps accepting any explicit path (references still resolve inside the workspace store). Commander's excess-argument error keeps commander's exit code (1).
9. **AUX-03**: SDK default stays non-strict (D-Q21); `hardkas verify` strict; `artifact verify` non-strict by default but every result (JSON and human) states `authScope` and the unauthenticated material fields.
10. **PSKT session digests** (`packages/sdk/src/pskt.ts`): pre-existing key-sorted JSON digests without an algorithm version; NOT switched to `domainDigest` (would re-key every persisted session's `integrityHash`); allow-listed in the scan with the reason and flagged as AUX for a decision.
11. **ZK corpus digests** stay on the explicit `legacyDomainDigest` (the shipped manifests store canonical-v4 digests); re-issuing the corpus is a corpus change, out of scope.
12. **Silver records** (`hardkas silver …`) now write v5 records with a derived label; the silverc-level suites (toolchain required, not in the hermetic gate) were not executed here — the record sealing is unit-tested through `silver-records.ts`.

## 7. Out of 1.3 on purpose

Q2-B / N4 (synthetic authorization, `synthetic-<64hex>`, multisig) → 1.4. Narratives (AUD-14 simulator/dev-server) → 1.5. TxObservation, `deriveTxStatus`, CONFIRMED/FINALIZED → Wave 2 (Q4). Endpoint normalisation → ARCHITECTURE_BLOCKED (recorded in §6.5). The pre-existing "Zod errors are warnings for hashVersion < 4 in non-strict" rule (1.1 ledger §8.6) is still NOT widened and still flagged.

## 8. Evidence pack (reviewer's 14 items)

| # | Item | Where |
|---|---|---|
| 1 | Finding / root cause | §1 |
| 2 | BEFORE reproduction | §2 (`w13-before.json` 12/52, `w13-before2-replay-verdict.json` 0/1) |
| 3 | Failing regression written first | §3 |
| 4 | Minimal diff | §4 |
| 5 | Targeted AFTER | §5 (`w13-after3.json` 109/109) + §5b |
| 6 | Legacy compatibility | §8.6 |
| 7 | Canonical hermetic gate | §8.7 |
| 8 | Typecheck | §8.8 |
| 9 | Lint | §8.9 |
| 10 | IC invariants affected | §8.10 |
| 11 | Identity changes, before/after | §8.11 |
| 12 | Affected v4 / rc.22 artifacts | §8.12 |
| 13 | `git diff --stat` | §8.13 |
| 14 | Version `0.12.0-rc.23` confirmed | §8.14 |

### 8.6 Legacy compatibility

- v1–v4 artifacts: unchanged from 1.1/1.2 (LEGACY non-strict, `MIGRATION_REQUIRED` strict). A legacy top-level `artifactId` is reported in `unauthenticatedMaterialFields`, never as `FORBIDDEN_IDENTITY_FIELD` (that code is v5-only).
- v4 snapshots/receipts: verified and replayed with the frozen legacy digest selected by their declared version (T-N7); for the plain localnet data shape the value equals the current digest anyway.
- Legacy `hardkas.txReceipt` = legacy submission (IC-2′.8): still resolvable through `{tx}` and listed by the query domain; its `status` no longer drives any decision (query divergences/invariants report insufficient evidence; replay verdict `REPLAY_LEGACY_AUTH_SCOPE`; CLI `sendOutcome` decides nothing).
- Migration path for legacy artifacts: `hardkas artifact migrate <path> --to 5` / `sdk.artifacts.migrate` (D-Q1.f); receipts whose `status` was never authenticated are refused (re-execute instead of re-issue).
- Legacy Silver records (v4, stored label) keep verifying under their version (`readRecord` uses `checkArtifactIdentity`); the Silver simulator accepts v4 input plans under their declared version.
- The ZK corpus manifests keep verifying (explicit legacy digest).

### 8.10 IC invariants touched

IC-1′.5 (ambient/`wf_` derivations removed), IC-1′.7 (domain digests), IC-1′.8 (unchanged, scan extended to literal versions), IC-2′.1–2, IC-2′.5–6, IC-2′.8 (R-iii part 1), IC-4′.1, IC-4′.3 (CLI wiring), IC-4′.5 (`FORBIDDEN_IDENTITY_FIELD`), IC-4′.6, IC-4′.7, IC-5′.6 (submission reference = lineage parent; Silver refs in v5), IC-5′.11 (tx-flow events), IC-7.1–7.5, D-Q1.f, D-Q20, D-Q21, N1 (records at v5), N6, N7, N8, N13, AUD-07/08/12/38, AUX-01/03/08. Not touched: IC-2′.3–4 and .7 (Wave 2), IC-6′ (1.4), endpoint normalisation (blocked).

### 8.11 Identity changes (before → after)

| What | Before (1.2 tree) | After (1.3) | Why |
|---|---|---|---|
| Golden `simulatedTxReceipt` | `5eb24c88…4770397d` | `82cf2531…b6f0e93f` | the simulated txId derives from the plan hash, and the plan's default `workflowId` is now the single derivation over a typed intent (`kind` included) |
| Golden `l1Plan`, `l1Signed`, `igraPlan`, `dagLinearScenario`, `dagWideScenario`, `massProfile`, `canonicalNested` | unchanged | unchanged | no `workflowId` / no excluded names in those fixed inputs |
| Root plan `workflowId` | intent digest (canonical v4 form, no `kind`) | `deriveWorkflowId({kind:"transfer",…})` (domain digest) | IC-7.4 |
| Workflow artifact | `hashVersion 1`, `artifactId: workflowId` | `hashVersion 5`, no `artifactId` (identity = contentHash) | N6 / IC-7.3 |
| Real send | `hardkas.txReceipt` `status:"submitted"` | `hardkas.txSubmission.v1` (no status) | R-iii part 1 |
| Silver CLI records | v4 + stored `artifactId` label | v5, label derived from the hash | IC-7.3 / N1 |
| Silver simulator receipts | v4 by a local canonicaliser, label lineage | v5 by THE canonicaliser, hex lineage | IC-1′ / IC-7.3 |
| `artifact create` | random `art_…` `artifactId` | contentHash only | IC-7.3 |
| Replay report | unsealed | sealed (hashVersion 5 + contentHash) | IC-4′.1 |
| Valid fixtures | 0.5.4-alpha placeholders | real v5 producers | AUD-38 |
| Localnet snapshot digests | canonical v4 | domain digest (same value for the plain data shape) | IC-1′.7 |

### 8.12 Affected v4 / rc.22 artifacts

Nothing on disk is rewritten. Every rc.22/rc.23 artifact keeps its identity and its LEGACY scope; decisions over its `status` are now refused everywhere a decision is taken (§6.6). `artifact migrate --to 5` re-issues plans/signed/traces… as new identities; legacy receipts cannot be re-issued (their `status` was never authenticated) and remain legacy submissions.

### 8.7 Canonical hermetic gate (FULL REGRESSION)

`node scripts/gate-hermetic.mjs --home <FRESH_SUPPORTED_TOOLCHAIN_BASELINE> -- --coverage.enabled=false`, 2026-09-25:

| Metric | Wave 1.2 exit (reference) | `gate-w13-full1` (first run) | `gate-w13-full2` (final) |
|---|---|---|---|
| vitest exit | 0 | 1 (9 failures in 8 files, §5c) | **0** |
| tests passed / failed / skipped | 1715 / 0 / 28 | 1780 / 9 / 28 | **1790 / 0 / 28** (same 28 pre-existing skips) |
| duration | 541 s | 557 s | 574 s |
| non-loopback attempts | 0 | 0 | 0 |
| loopback targets (pre-existing probes) | 18210 ×3, 19999 ×1, 7420 ×2, 8545 ×9 | identical | identical |
| Docker containers before vs after | identical | identical | identical (`docker-before/after-gate-w13-full2.txt`, sha256 `94D22752…`, 0 created) |
| gate verdict | PASS | FAIL (kept as the BEFORE of §5c) | **PASS** |

#### 5c. Full-gate fallout (`gate-w13-full1`, 9 failures) and how each was resolved

| File | Cause under the new contract | Resolution |
|---|---|---|
| `artifacts/test/v2-artifacts.test.ts` "migrate v1 to canonical" | fixture declared no `hashVersion`/`contentHash`: unverifiable, so not a migration source (IC-4′.2); it also lacked the fields a valid plan needs | explicit legacy fixture sealed under hash version 1 with plan fields; asserts the re-issued plan is v5 with a recomputed label (`planId` was a label in v1 too, so it is neither re-issued nor a claim) |
| `testing/test/backward-compat.test.ts` "broken lineage across migrationReceipt" | fake `contentHash: "a"*64` (unverifiable) | v4 legacy plan whose (broken) `lineageId`/`rootArtifactId` v4 authenticated; they are carried by the re-issue and the receipt, exactly the property named by the test |
| `cli/test/json-contract.test.ts` "verify --json" | the golden plan is legacy → `hardkas verify` (strict, AUD-12) correctly exits 1 | the workspace holds the regenerated v5 valid fixture; `ok: true` asserted as before |
| `cli/test/root-commands.test.ts` | used `--deep` (removed, AUX-01) | flag dropped |
| `query-store/test/rebuild-equivalence.test.ts` | the mock wrote a top-level `artifactId` on a v5 artifact (IC-7.3 → corrupt) | field removed (fixtures distinguished by `txId`) |
| `query-store/test/wave1-2-n2-collision.test.ts` (2) | v5 impostor/child with top-level `artifactId` → `FORBIDDEN_IDENTITY_FIELD` | T-N2 split: the LEGACY (v4) impostor keeps the original property; a v5 impostor is CORRUPTED under a path key with `FORBIDDEN_IDENTITY_FIELD`, victim intact; the edges test uses a v4 child |
| `artifacts/test/adversarial/wave1-1-canonical-v5.test.ts` IC-1′.6 snapshot | two new schemas declare operational fields (`TxSubmissionSchema.{createdAt,hardkasVersion,rpcUrl,submittedAt}`, `ReplayReportSchema.{createdAt,hardkasVersion}`) | snapshot extended with exactly those 6 entries (no new NAME enters the closed list) |
| `artifacts/test/adversarial/wave1-2-resolver.test.ts` T-P7 | the v5 impostor carrying `artifactId` is no longer reachable even by its own identity (fails closed) | asserts `CANDIDATE_INVALID`/`FORBIDDEN_IDENTITY_FIELD` for the v5 impostor and keeps the original property with a LEGACY (v4) impostor |

`w13-fallout1` (8 files): 51/52 → one wrong assumption of mine (`planId` as a legacy claim) corrected → `w13-fallout2` 8/8; then `gate-w13-full2` PASS.

### 8.8 Typecheck

`pnpm typecheck` (turbo, `^build` first): `typecheck-w13-1` EXIT 1 (one TS2344: `"txSubmission.v1"` missing from core's `artifactTypeSchema`; added), `typecheck-w13-2` EXIT 0, `typecheck-w13-3` EXIT 0 (55/55 tasks, fresh dist before the full gate). The pskt-native binary was restored after each build (`git status --short packages/pskt-native` clean).

### 8.9 Lint (pre-existing debt separated from new)

`pnpm lint --continue` (`lint-w13.log`): 13/15 tasks successful, **5 errors, all pre-existing and in files untouched by Waves 0–1.3** (identical to the 1.1/1.2 ledgers): `packages/sdk/src/igra.ts:31` no-constant-condition, `packages/sdk/src/pskt/adapters/test-fake.ts:26` prefer-as-const, `packages/cli/src/runners/torture-runner.ts:458,493` no-irregular-whitespace, `packages/cli/templates/wallet-backend/src/domain/WalletService.test.ts:1` parsing error. 0 errors in every other package (warnings only). Lint status for 1.3: **PARTIAL for the same pre-existing reason, no new errors**.

### 8.13 `git diff --stat`

The owner committed during this session (`0b1b43f8e` / `36ad35a02` "[KLD]: 0.12.0-rc.23 version": the Wave 0–1.2 tree plus the four `packages/artifacts/test/adversarial/wave1-3-*.test.ts` files as they stood at that moment; `2905009e1`: `.gitignore` and `audit/evidence/**` env logs — the owner's, not mine). Working tree vs `HEAD = 2905009e1`: `67 files changed, 1725 insertions(+), 530 deletions(-)` plus 12 untracked files of mine (3 new `packages/artifacts/src/*.ts`, 2 new CLI runners, 7 new test files) and 3 untracked root markdown files that are the owner's (`HARDKAS-RC23-*-AUDIT*.md`). Full lists: `diff-stat-w13.txt`, `status-w13.txt`. `pnpm-lock.yaml`: +3 lines (the `packages/simulator` importer only; an unrelated `@emnapi/runtime` drift produced by the offline install was reverted by hand). No file under `.changeset/` was added or changed. Working tree vs the pre-wave base `746e47d7b`: 201 files, +10611/−4038 (Waves 0–1.3 together).

### 8.14 Version

`pnpm version:check` → EXIT 0: "All workspace packages match version 0.12.0-rc.23 and the tree references no newer version" (4658 files scanned). No dist-tag, publish, release or changeset action; AUD-02 stays BLOCKED.

### 8.15 Status

`WAVE_1_3_COMPLETE — evidence pack ready; proceeding to Wave 1.4 (Q2-B, N4) in the mandatory order`. No STOP condition met: the endpoint normalisation stayed ARCHITECTURE_BLOCKED and was not designed (§6.5); every other derived choice (§6) is recorded for the adversarial re-audit.

