# WAVE_1_3_SECURITY_FIXES

Scope: exclusively the two blockers of `WAVE_1_3_SECURITY_REVIEW.md` (B1, B2). No Wave 1.4 work, no DEFER SAFE item, no non-blocking architecture decision. Version stays `0.12.0-rc.23`; no publish, changeset, manifest or lockfile change. Nothing committed.

Model: REPRODUCE → TEST FAILING → MINIMAL FIX → TARGETED PASS → DIRECTED NO-FALLOUT SET. The full hermetic gate was NOT re-run (no cross-cutting fallout appeared; see §5).

---

## B1 · PARENT_MIGRATED forge

### Root cause
`verifyArtifactSemantics()` (`packages/artifacts/src/verify.ts`), parent branch: when `lineage.parentArtifactId` resolved to nothing (`REFERENCE_MISSING`), `findMigrationCertificate()` looked for any FULL `hardkas.migrationReceipt.v1` in the store with `oldHash = parent` and `newHash = child` (or treated the child itself as that receipt) and downgraded the missing parent to an `info` (`PARENT_MIGRATED` / `MIGRATION_SOURCE_ABSENT`). A receipt is a self-consistent artifact that any workspace writer can mint; nothing bound it to a real migration or to an existing source. A reference that resolves to nothing therefore passed strict verification, violating IC-5′.6 ("se resuelven solo por artifactId, con verificación del objetivo").

### BEFORE reproduction
- Review script `review-parent-migrated-forgery.mts` (unchanged code): `integrityOk: true, integrityScope: FULL, semanticsOk: true, codes: ["info:PARENT_MIGRATED"]`.
- Regression file `packages/artifacts/test/adversarial/wave1-3-b1-parent-migrated-forge.test.ts`, run `w13fix-before3`: **5 / 5 failed**, each for the defect:
  - forgery (signed): `semantics.ok` was `true` (expected `false`);
  - forgery (receipt itself): `semantics.ok` was `true`;
  - genuine migration WITHOUT the source in the store: `semantics.ok` was `true` (the exception hid the missing parent);
  - positive and conditions tests: `findSupersedingMigration` did not exist.
  (Runs `w13fix-before` / `w13fix-before2` failed the two positive tests on `ECONOMIC_VIOLATION`: a fixture error of mine — unrealistic fee/mass. The fixture was corrected to the values the economic verifier recomputes, 3001 mass / 300100 sompi, before `w13fix-before3`. The security assertions were not changed.)

### Exact fix
1. `packages/artifacts/src/verify.ts`
   - `findMigrationCertificate()` deleted.
   - Parent branch: `REFERENCE_MISSING` → `PARENT_MISSING` (error in strict, warning otherwise), unconditionally. No receipt, anywhere, changes that outcome.
   - Unused `enumerateWorkspaceArtifactsSync` import removed.
2. `packages/artifacts/src/migration.ts` — new `findSupersedingMigration(workspaceRoot, legacySource)`: returns `{ receiptId, newArtifactId }` only when ALL hold:
   - the source verifies under its declared version and is `LEGACY` scope (a v5 artifact is never "superseded");
   - a `hardkas.migrationReceipt.v1` in the store verifies **strict** with `authScope: FULL` and `oldHash` = the source's recomputed identity;
   - its `newHash` resolves in the store (`resolveArtifactSync`, i.e. present, unambiguous, a valid candidate);
   - that artifact verifies **strict**, `FULL`, with `actualHash === newHash`;
   - its authenticated `lineage.parentArtifactId === legacySource.artifactId`.
   It is informative only: it never participates in reference resolution and never changes the source's scope.
3. `packages/cli/src/runners/artifact-verify-runner.ts` — store verification only (`storeVerification: true`, set exclusively by `hardkas verify`): when a file's ONLY error is `MIGRATION_REQUIRED` and `findSupersedingMigration` returns a result, that error is replaced by `SUPERSEDED_BY_MIGRATION` (info). The source keeps `authScope: LEGACY`. `artifact verify`, the SDK verifier and every decision path are unaffected (`verifyArtifactIntegritySync(legacy, { strict: true })` is still `MIGRATION_REQUIRED`).
   `packages/cli/src/commands/verify.ts` passes `storeVerification: true`.
4. The legacy source stays in the store after migration:
   - `packages/sdk/src/artifacts-manager.ts` `migrate()`: after the source is verified and BEFORE the re-issue is written, the source is resolved in the store by its artifactId; if absent it is written there through `ProjectArtifactStore.writeArtifact` (byte-identical body; the store re-checks its declared-version hash). Any other resolution error (`CANDIDATE_INVALID`, ambiguity) aborts the migration. The original file is never modified. Result gains `sourcePath`.
   - `packages/cli/src/runners/artifact-migrate-runner.ts`: `result.sourcePath` reported (JSON and human).

### Regression tests
- `packages/artifacts/test/adversarial/wave1-3-b1-parent-migrated-forge.test.ts` (new, 5 tests):
  - **exact exploit**: v5 `signedTx` + ghost `parentArtifactId` + forged FULL MigrationReceipt in the store → both forged artifacts are FULL-consistent, and strict semantics of the signed → `ok: false`, `error:PARENT_MISSING`, no `PARENT_MIGRATED`/`MIGRATION_SOURCE_ABSENT`;
  - the forged receipt itself → `error:PARENT_MISSING`;
  - **positive**: genuine migration with the legacy source present → re-issue and receipt verify strict through the normal parent path; `findSupersedingMigration` returns the pair; strict integrity of the source is still `MIGRATION_REQUIRED` (no authority conferred);
  - the same genuine migration WITHOUT the source → `error:PARENT_MISSING` (the source must stay);
  - every condition individually: receipt without re-issue, re-issue whose parent is not the source, a v4 (non-FULL) receipt, a re-issue that fails strict (forbidden top-level `artifactId` → candidate invalid), a v5 "source" → all `undefined`; control completes the set → defined.
- `packages/cli/test/wave1-3-verify-cli.test.ts` (spawned dist):
  - new: **`hardkas verify` on a workspace holding the exact forgery → EXIT≠0, `ok:false`, both forged files `PARENT_MISSING`**, no `PARENT_MIGRATED`/`MIGRATION_SOURCE_ABSENT`/`SUPERSEDED_BY_MIGRATION`;
  - extended D-Q1.f: after `artifact migrate --to 5` from a file outside the store, `result.sourcePath` is under `.hardkas/artifacts/` with the source's identity; `hardkas verify` is green with the source row `authScope: LEGACY`, `SUPERSEDED_BY_MIGRATION`, no `MIGRATION_REQUIRED`, and no `PARENT_MISSING` anywhere.

### AFTER
- Review script: `semanticsOk: false, codes: ["error:PARENT_MISSING"]` (integrity of the forged artifacts still FULL — the defect was never a hash mismatch).
- See §5.

---

## B2 · Rejected broadcast recorded as workflow success

### Root cause
Wave 1.3 made a real `send()` record a rejected submit (`txSubmission.v1` with `submitResult.accepted: false`) and return `submitted: false` instead of throwing. `packages/sdk/src/workflow.ts` was not adapted: both send paths (script `ctx.tx.send` and declarative `tx.send`) ignored `submitted` and fell through to `stepRecord.status = "success"`, so a version-5, strictly verifiable workflow artifact asserted success over a transaction the node rejected.

### BEFORE reproduction
Regression file `packages/sdk/test/adversarial/wave1-3-b2-workflow-rejected-send.test.ts`, run `w13fix-before`: the two rejection tests failed with `expected 'completed' to be 'failed'` (declarative and script); the accepted-submit control passed.

### Exact fix
`packages/sdk/src/workflow.ts`: a local `assertBroadcastAccepted(res)` called immediately after `send()` in BOTH paths. When `res.submitted === false` (and the result is not the simulator's `simulated: true` path, see §6) it throws `HardkasError("TX_SUBMISSION_REJECTED", …)` naming the recorded submission's artifactId and the node's reason. The existing step `catch` turns it into a `failed` step, a `failed` workflow and the normal `errorEnvelope` (`code: TX_SUBMISSION_REJECTED`). The submission artifact itself stays recorded (it is what HardKAS did).

### Regression tests
`packages/sdk/test/adversarial/wave1-3-b2-workflow-rejected-send.test.ts` (new, 3 tests). The workspace is simulated (plan and sign are synthetic); the instance reports a non-simulated network so the workflow takes its `send` branch; `tx.send` is forwarded to the REAL implementation with an explicit loopback URL; the rejection comes from the mocked `rpc.submitTransaction` inside the real `send()`. Nothing else is stubbed.
- declarative `tx.send`: submitTransaction rejected → the real `send()` result has `submitted: false` and `submission.submitResult.accepted: false` → send step `failed` → workflow `failed`, `errorEnvelope.code = TX_SUBMISSION_REJECTED`, message carries the submission artifactId; never a `success` send step;
- script `ctx.tx.send`: same chain → script step `failed` → workflow `failed`, `TX_SUBMISSION_REJECTED`;
- control: an accepted submit keeps the send step `success` on both paths (the guard is not a blanket failure).

---

## 5. AFTER evidence

| Run | Scope | Result |
|---|---|---|
| review script | original forgery | `semanticsOk: false`, `error:PARENT_MISSING` |
| `w13fix-after1` | B1 + B2 regressions, migration (`wave1-3-migration`, `sdk/migration`, `testing/backward-compat`, `v2-artifacts`), verify/semantics (`wave1-3-verify-fail-closed`, `wave1-2-references`, `wave6-lineage-cycle-safety`), workflow (`workflow-contract`, `workflow-determinism`), send/submission (`wave1-3-producers`, `wave1-3-replay-legacy-verdict`, `wave1-3-cli-helpers`, `wave1-3-verify-cli`) | **105 / 105 passed**, hermetic PASS, 0 network attempts |
| `w13fix-after2` | directed no-fallout set: the ENTIRE `packages/artifacts/test` and `packages/sdk/test` trees + every spawned-CLI suite that runs `verify`/workflow (`json-contract`, `root-commands`, `smoke`, `wave5-discovery-delegation`, `wave8-single-envelope`, `wave7-replay-mode-guard`, `replay-divergence`, `wave1-2-next-steps`, `workflow-corpus`) + `testing/backward-compat` | **510 passed / 0 failed / 11 skipped** (pre-existing skips of those suites), hermetic PASS, 0 non-loopback attempts; loopback `127.0.0.1:18210 ×2` = the pre-existing `sdk.localnet.status()` probe recorded in Wave 0 |
| build | `pnpm --filter @hardkas/artifacts --filter @hardkas/sdk --filter @hardkas/cli build` (ESM + DTS) | success; pskt-native binary untouched |
| typecheck | `pnpm --filter @hardkas/artifacts --filter @hardkas/sdk --filter @hardkas/cli typecheck` | see §5.1 |

Why no full gate: the changes are (a) the removal of one branch in the parent path of `verifyArtifactSemantics`, whose consumers are the artifacts, sdk and CLI-verify suites (all run in `w13fix-after2`); (b) a new function used only by `hardkas verify` store verification; (c) an extra store write inside `sdk.artifacts.migrate`; (d) a guard in the two workflow send paths. No producer, canonical form, hash, resolver, digest or schema changed, so no golden, fixture or cross-package identity can move.

### 5.1 Typecheck
`pnpm --filter @hardkas/artifacts --filter @hardkas/sdk --filter @hardkas/cli typecheck` → `sdk` Done, `cli` Done, **0 `error TS`** (`typecheck-w13fix.log`). `@hardkas/artifacts` has no `typecheck` script (pre-existing AUD-29); its source is type-checked by the DTS build above, which succeeded.

## 6. Files changed

The owner committed the complete Wave 1.3 tree as `5c2f0ec4f` while these fixes were in progress. The working tree vs `HEAD = 5c2f0ec4f` is therefore **exactly the B1/B2 fix**: `8 files changed, 239 insertions(+), 59 deletions(-)` plus 2 untracked test files (the 3 untracked root `HARDKAS-RC23-*-AUDIT*.md` files are the owner's). `pnpm-lock.yaml`, `.changeset/` and the pskt-native binary are untouched.


Source:
- `packages/artifacts/src/verify.ts` — `findMigrationCertificate` and the `PARENT_MIGRATED`/`MIGRATION_SOURCE_ABSENT` branch removed; `PARENT_MISSING` restored.
- `packages/artifacts/src/migration.ts` — `findSupersedingMigration`, `SupersedingMigration` (+ imports from `resolve.js`).
- `packages/sdk/src/artifacts-manager.ts` — `migrate()` keeps the verified source in the store; `sourcePath` in the result.
- `packages/sdk/src/workflow.ts` — `assertBroadcastAccepted` in both send paths.
- `packages/cli/src/runners/artifact-verify-runner.ts` — `storeVerification` option; source-side `SUPERSEDED_BY_MIGRATION`.
- `packages/cli/src/commands/verify.ts` — passes `storeVerification: true`.
- `packages/cli/src/runners/artifact-migrate-runner.ts` — reports `sourcePath`.

Tests:
- new `packages/artifacts/test/adversarial/wave1-3-b1-parent-migrated-forge.test.ts`
- new `packages/sdk/test/adversarial/wave1-3-b2-workflow-rejected-send.test.ts`
- `packages/cli/test/wave1-3-verify-cli.test.ts` — new forgery test; D-Q1.f test extended (source kept in store, `SUPERSEDED_BY_MIGRATION`).

No manifest, lockfile, fixture, golden, schema, docs or changeset file changed.

## 7. Deviations (for the short READ-ONLY review)

1. **B2 guard excludes `simulated: true`.** The mandate says "si `res.submitted === false`". The simulator path of `send()` also returns `submitted: false` (nothing is broadcast by design) with `simulated: true`. It is reachable from the workflow's `send` branch when the instance network name is not literally `"simulated"` but its config kind is `simulated` (the workflow branches on the name, `send()` on name OR kind). Without the exclusion such workflows would fail spuriously. A real rejection always has `simulated` absent and `submission.submitResult.accepted: false`.
2. **B1 "source stays in the store" when the source was outside it.** `artifact migrate <path>` accepts a workspace-contained file outside `.hardkas/artifacts` (the D-Q1.f CLI test does exactly that). For the re-issue's parent to resolve, the verified source is written into the store as a byte-identical copy (its identity and LEGACY scope unchanged; the original file untouched). Alternative rejected: refusing migrations of sources outside the store. The copy happens before the re-issue is written, so a failure never leaves a re-issue with a missing parent.
3. **Where `SUPERSEDED_BY_MIGRATION` applies**: only `hardkas verify` store verification (recursive runner with `storeVerification`). Not `artifact verify`, not the SDK verifier, not `verifyArtifactIntegritySync` — so it can never make a legacy artifact pass a strict reference or parent check.
4. **Conditions beyond the list**: `findSupersedingMigration` additionally requires the re-issue's recomputed hash to equal `newHash` (implied by "newHash existe realmente") and that the source itself verifies under its declared version and is LEGACY (a v5 artifact is never superseded). Nothing else was added.
5. The ledger's §6.4 (missing parent tolerated under a receipt) is withdrawn by this fix; the MigrationReceipt exemption from `MISSING_WORKFLOW_ID`/`MISSING_ASSUMPTION_LEVEL` (a receipt carries no workflow correlation of its own) is unchanged — it grants no resolution authority.

---

## B1-bis · residual supersession classification defect (WAVE_1_3_SECURITY_FIX_REVIEW §1.3)

Scope: exclusively the predicate of `findSupersedingMigration` plus its regressions, as instructed. No change to migration, hashing, resolution or lineage.

### Invariant (written down)
**Descent is not re-issue.** A MigrationReceipt may mark a legacy source as superseded only when the new artifact is a verifiable re-issue of the same semantic class (same base schema, `.v1` suffix aside) AND the receipt describes exactly the observed schemas — never merely because a valid v5 child hangs from that source.

### Root cause
The predicate accepted any FULL artifact whose `lineage.parentArtifactId` was the source: a proof of descent, not of migration. A legitimate v5 signed tx under a legacy plan, plus a forged FULL receipt `old=plan,new=signed`, made the plan `SUPERSEDED_BY_MIGRATION` in `hardkas verify`.

### BEFORE reproduction (`w13fix2-before`)
- `review2-supersede-abuse.mts` (unchanged code): `superseding: { receiptId: 484b0903…, newArtifactId: 397769e7… }` for the plan → signed child + forged receipt.
- Regressions, 3 failed for the defect: case 1 (attack) returned the pair; case 3 (forged `fromSchema`) returned the pair; `hardkas verify` on the attack workspace reported the legacy plan as `SUPERSEDED_BY_MIGRATION` instead of `MIGRATION_REQUIRED`. Cases 2 / 2b (genuine plan → plan, and `.v1` → base) already passed and are the non-regression gate.

### Exact fix
`packages/artifacts/src/migration.ts` — `findSupersedingMigration`, two extra conditions after the existing ones (`baseSchemaOf` strips a trailing `.v1`):
1. `baseSchemaOf(reissued.schema) === baseSchemaOf(legacySource.schema)` (both defined);
2. `receipt.fromSchema === legacySource.schema && receipt.toSchema === reissued.schema`.
A plan's signed child fails (1) even with a correct `parentArtifactId`; a receipt with correct hashes but falsified schema metadata fails (2). Genuine re-issues satisfy both: `migrateArtifactToHashVersion` keeps the schema and `generateMigrationReceipt` writes the observed schemas; the 0.1.0 → 1.0.0-alpha step strips only `.v1`.

### Regression tests
- `packages/artifacts/test/adversarial/wave1-3-b1-parent-migrated-forge.test.ts`, new `describe` "B1-bis":
  - **case 1 (attack)** legacy plan `L` → legitimate v5 signed child `S` (real producer, strict-valid) + forged FULL receipt `old=L,new=S` with honest schemas → `undefined`; `L` strict integrity still `MIGRATION_REQUIRED`;
  - **case 2 (genuine)** plan → re-issued plan → the pair; the re-issue is a strict member of the store;
  - **case 2b (genuine, schema-version step)** `hardkas.txPlan.v1` (0.1.0) → `hardkas.txPlan` → the pair (same base schema);
  - **case 3 (metadata forgery)** genuine hashes, receipt with `fromSchema` forged, `toSchema` forged, or both → `undefined` each; the honest receipt → the pair.
- `packages/cli/test/wave1-3-verify-cli.test.ts`, new spawned test: the attack workspace → `hardkas verify` EXIT≠0, `ok:false`, the legacy plan row keeps `MIGRATION_REQUIRED` and never `SUPERSEDED_BY_MIGRATION`.

### AFTER
- `review2-supersede-abuse.mts`: `superseding: null` (child still strict-valid, `L` still `MIGRATION_REQUIRED`).
- `w13fix2-after` (directed B1/migration/verify set: the B1 file, `wave1-3-migration`, `sdk/migration`, `testing/backward-compat`, `v2-artifacts`, `wave1-3-verify-fail-closed`, `wave1-2-references`, `wave6-lineage-cycle-safety`, `wave1-3-producers`, B2 file, `wave1-3-verify-cli`, `wave1-3-cli-helpers`, `json-contract`, `root-commands`): **110 / 110 passed**, hermetic PASS, 0 network attempts. Builds (artifacts, cli; ESM + DTS) succeeded; pskt-native binary untouched.

### Files changed (B1-bis delta)
- `packages/artifacts/src/migration.ts` (predicate + `baseSchemaOf`)
- `packages/artifacts/test/adversarial/wave1-3-b1-parent-migrated-forge.test.ts` (+4 tests)
- `packages/cli/test/wave1-3-verify-cli.test.ts` (+1 test)

### Deviations
None beyond the two conditions the review proposed. The genuine `.v1` step is covered explicitly (case 2b) because base-schema equality is what distinguishes it from a child.

STOP. Wave 1.4 not started.
