# WAVE_1_3_SECURITY_FIX_REVIEW

Mode: READ-ONLY, limited to the B1/B2 delta of `WAVE_1_3_SECURITY_FIXES.md` (working tree vs `5c2f0ec4f`). No code modified, no full gate, no Wave 1.4, no DEFER SAFE reopened. One targeted reproduction was run (§1.3). The reviewer authored the delta; every claim below was checked against the code, not the fix report.

## 1. B1 — PARENT_MIGRATED

### 1.1 PARENT_MISSING is fail-closed again
`packages/artifacts/src/verify.ts`, parent branch: `REFERENCE_MISSING` → `PARENT_MISSING` (error in strict) with no exception of any kind; `findMigrationCertificate` is gone and no `PARENT_MIGRATED` / `MIGRATION_SOURCE_ABSENT` remains in `packages/*/src`. The review's original forgery script now returns `semanticsOk: false, ["error:PARENT_MISSING"]`; the exact exploit is a committed regression at artifacts level and through the spawned `hardkas verify` (EXIT≠0, both forged files `PARENT_MISSING`). The explicit in-memory `context.parent` remains identity-checked (a forged parent object would need a hash preimage). **Holds.**

### 1.2 SUPERSEDED_BY_MIGRATION scope
`findSupersedingMigration` is called from exactly one place, `packages/cli/src/runners/artifact-verify-runner.ts::runRecursiveVerify`, guarded by `options.storeVerification` which only `packages/cli/src/commands/verify.ts` sets. It is not reachable from `artifact verify`, the SDK verifier, `verifyArtifactIntegritySync`, the resolver, or any decision path (`sendOutcome`, `findExistingSubmission`, replay verdict, query gates were re-checked: unchanged). When applied it replaces only `MIGRATION_REQUIRED`, only if no other error exists, and leaves `authScope: LEGACY` in the row. The source's own strict integrity is still `MIGRATION_REQUIRED` (asserted by the positive regression). **No new resolution authority; LEGACY never becomes FULL.**

### 1.3 SECURITY DEFECT — a v5 CHILD passes as a "re-issue": a legacy root that was never migrated is reported superseded
- Reproduction (`review2-supersede-abuse.mts`): legacy v4 root plan `L` in the store; a **legitimate v5 signed tx `S`** whose `lineage.parentArtifactId = L` (a normal child, produced by `createSimulatedSignedTxArtifact(L)`); a forged FULL receipt `R { oldHash: L, newHash: S, fromSchema: txPlan, toSchema: signedTx }`. Result:

  ```
  childSchema: hardkas.signedTx, childStrictSemanticsOk: true,
  legacyStrictIntegrity: [MIGRATION_REQUIRED],
  superseding: { receiptId: 484b0903…, newArtifactId: 397769e7… }
  ```

  `findSupersedingMigration(ws, L)` returns the pair, so `hardkas verify` reports `L` as `SUPERSEDED_BY_MIGRATION` (info) and the store verdict is `ok: true` / EXIT 0 although `L` was never re-issued and is still the live root of an executable v5 chain.
- Property violated: IC-4′.3 (a v≤4 artifact under strict is `MIGRATION_REQUIRED`; the only ratified exception in this delta is a **genuine re-issue**) and IC-4′.6 (the store verdict must reflect the result: a forged receipt silences the one signal that flagged the legacy root). This is precisely the receipt/re-issue/source mixing the mandate asked to exclude: the "new" artifact is a descendant, not a re-issue.
- File / line: `packages/artifacts/src/migration.ts`, `findSupersedingMigration`, the acceptance conditions ending at line 684 (`if (reissued?.lineage?.parentArtifactId !== legacyId) continue;`). Nothing ties `newHash` to the source's schema, and `fromSchema` / `toSchema` are never compared.
- Minimal fix (two conditions, same function):
  1. the re-issue keeps the source's kind: `baseSchema(reissued.schema) === baseSchema(legacySource.schema)` where `baseSchema` strips a trailing `.v1` (that is exactly what `migrateArtifactToHashVersion` and the 0.1.0→1.0.0-alpha step produce; a plan→plan child does not otherwise exist as a lineage transition);
  2. the receipt describes that link: `receipt.fromSchema === legacySource.schema && receipt.toSchema === reissued.schema`.
  Regression to add: the reproduction above must return `undefined` (and `hardkas verify` must keep `MIGRATION_REQUIRED` for `L`); the genuine positive case must still return the pair.
- Not affected by this defect: reference resolution, strict semantics of any artifact, decision paths, the LEGACY scope of `L`. The gain is a false-green store audit over a legacy root, which is what the tolerance's conditions exist to prevent.

### 1.4 Source copy into the store (TOCTOU / overwrite / ambiguity / substitution)
`sdk.artifacts.migrate` verifies the in-memory source, then resolves its identity in the store; the store copy is written from the same verified object (no re-read, no TOCTOU) and re-checked by `ProjectArtifactStore.writeArtifact` under the declared version. A file that claims the source's identity with different content aborts the migration (`CANDIDATE_INVALID` is not `ARTIFACT_NOT_FOUND`); ambiguity aborts likewise. Substituting the stored source afterwards makes the re-issue's parent `PARENT_CORRUPT` (fail closed). The only file the copy can overwrite is one already named by the source's identity without being it, i.e. an impostor claim, a pre-existing store naming property, not a new one. **Holds.**

## 2. B2 — rejected broadcast

- `assertBroadcastAccepted` runs immediately after `send()` on both paths (script `ctx.tx.send`, declarative `tx.send`); a real rejection (`submitted: false`, no `simulated`) throws `TX_SUBMISSION_REJECTED` into the step `catch` → step `failed`, workflow `failed`, `errorEnvelope.code = TX_SUBMISSION_REJECTED`, submission id in the message. Both paths and the accepted control are covered by regressions that reach the REAL `send()` with a mocked node answer.
- The `simulated: true` exclusion cannot be forged: the field is set only by `send()` itself on its simulator branches (`packages/sdk/src/tx.ts` 1435 and 1449, chosen by config, never by an artifact or by the node's answer); the real branch returns `submitted: submitResult.accepted` (line 1564) and never sets `simulated`. No artifact, RPC response or workspace content flows into that key. The submission stays recorded (written by `send()` before the guard). **Holds.**

## 3. New authority check
MigrationReceipt confers no resolution authority anywhere (§1.1, §1.2). `SUPERSEDED_BY_MIGRATION` never changes `authScope`; the legacy source remains LEGACY under every verifier; a re-issue needs its real, resolvable, verifiable parent (asserted by the "same migration without the source → PARENT_MISSING" regression). The one remaining gap is §1.3: the tolerance can be *obtained* for a non-re-issue, not that it grants authority.

## 4. Verdict

`BLOCK_WAVE_1_4`

Single blocker, §1.3, inside the B1 delta: `findSupersedingMigration` accepts a v5 child plus a forged receipt as a re-issue. Two-condition fix in one function plus one regression; nothing else in the delta is disputed.

STOP.
