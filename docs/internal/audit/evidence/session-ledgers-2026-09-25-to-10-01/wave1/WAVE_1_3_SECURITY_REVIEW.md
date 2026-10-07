# WAVE_1_3_SECURITY_REVIEW

Mode: READ-ONLY adversarial review of the Wave 1.3 diff (working tree vs the pre-1.3 state) and `WAVE1-3-LEDGER.md`. No code, test, manifest, lockfile, plan or ledger was modified. The full hermetic gate was NOT re-run; its evidence (`gate-w13-full2`: 1790 / 0 / 28, PASS) is accepted as implementation evidence. Two targeted reproductions were run (§B1, §B2), nothing else.

Reviewer note: the reviewer is the author of the diff. Every finding below was verified against the code as it is, not against the ledger's description of it.

## 1. Blockers

### B1 · SECURITY DEFECT — a self-certifying MigrationReceipt manufactures a verified lineage over a parent that never existed

- Path / symbol: `packages/artifacts/src/verify.ts` → `findMigrationCertificate()` and its use in `verifyArtifactSemantics()` (parent resolution branch, `outcome.issue.code === "REFERENCE_MISSING"` → `PARENT_MIGRATED` / `MIGRATION_SOURCE_ABSENT`, severity `info`).
- Property violated: IC-5′.6 ("las referencias persistidas … se resuelven solo por artifactId, **con verificación del objetivo**") and IC-3′ ("el linaje verificado hasta una raíz confiable" as one of the three sources of authenticity). Under the exception a reference resolves to nothing and strict lineage still passes.
- Exploit (reproduced, `review-parent-migrated-forgery.mts`): a workspace writer creates (a) a version-5 `hardkas.signedTx` `S` whose `lineage.parentArtifactId` is a 64-hex value that exists nowhere, and (b) a version-5 `hardkas.migrationReceipt.v1` `R` with `oldHash = ghost`, `newHash = S.contentHash`, lineage rooted at the ghost. Both are sealed consistently (FULL). Result:

  ```
  integrityOk: true, integrityScope: FULL, semanticsOk: true, codes: ["info:PARENT_MIGRATED"]
  ```

  `verifyArtifactSemantics(S, { strict: true, workspaceRoot })` is green. Before 1.3 the same `S` failed strict with `PARENT_MISSING`. The receipt checks nothing that a writer cannot supply: `oldHash`/`newHash` are free strings, `fromSchema`/`toSchema` are not compared with the child's schema, and the receipt's own missing parent is excused by the sibling rule (`kind: "self"`). Nothing ties `R` to an execution of `migrateArtifactToHashVersion`.
- Consequence today: `hardkas verify`, `artifact verify --strict`, `explain` (affirmative) and the strict pre-broadcast verification in `send()` accept a chain whose root does not exist. Consequence for 1.4: IC-6′.2 must "resolver el plan solo por ese artifactId, verificarlo" — if the binding sits on the parent-resolution path, a forged receipt bypasses it. The exception must not survive into 1.4.
- Minimal fix (both parts):
  1. Remove the exception from the child side: delete `findMigrationCertificate` and the `PARENT_MIGRATED` / `MIGRATION_SOURCE_ABSENT` branch; a missing parent is `PARENT_MISSING` again (error in strict). A migrated artifact's parent (the legacy source) stays in the store and resolves under its declared version, as any other parent does (the parent recursion already runs semantics, not strict integrity, so a LEGACY parent resolves).
  2. Move the tolerance to the source side, where it grants nothing: in recursive store verification (`hardkas verify`), a **legacy** artifact `L` that is the `oldHash` of a FULL MigrationReceipt `R` **whose `newHash` artifact exists in the store, verifies strict, and carries `lineage.parentArtifactId === L.artifactId`**, is reported as `SUPERSEDED_BY_MIGRATION` (info) instead of `MIGRATION_REQUIRED`. A forged receipt can then only re-label a legacy artifact that no decision path uses anyway; it can never make a reference resolve to nothing. Regression to add: the exact forgery above must yield `PARENT_MISSING` (strict error) for `S`, and a genuine migration (source present) must be green under `hardkas verify`.
  This also re-opens the ledger's derived decision §6.4 as **ARCHITECTURE DECISION REQUIRED**: whether a legacy source may ever leave the store after migration (this review says no: a re-issue references its source, so the source stays, marked superseded).

### B2 · SECURITY DEFECT — a rejected real broadcast is recorded as a successful workflow step

- Path / symbol: `packages/sdk/src/workflow.ts`, script context `send` handler (`const res = … await this.sdk.tx.send(signed, parentHint(signed)); … return res;`) and the declarative branch (`const { receipt } = … await this.sdk.tx.send(lastSigned, …)`), followed by `stepRecord = { type, status: "success", … }`.
- Property violated: the "éxito falso sin ejecutar" family (N5 / IC-2′.8): a workflow artifact (FULL scope, itself authenticated) states `steps[i].status: "success"` for a step whose broadcast the node rejected.
- Failure mode: Wave 1.3 changed `send()` so that a rejected `submitTransaction` is RECORDED (`submission.submitResult.accepted = false`, result `submitted: false`) instead of thrown (ledger §6.5). The CLI handles it (`TX_SUBMISSION_REJECTED`, exit 1). `workflow.ts` does not: it never reads `res.submitted`, writes the submission again and marks the step `success`, so the produced `hardkas.workflow.v1` artifact — a version-5, strictly verifiable artifact — asserts success over a rejected transaction. Any consumer of workflow artifacts (`hardkas status`, `read({ workflow })`, dashboards) inherits the false claim.
- Minimal fix: in both send sites, after the call: `if (res.submitted === false) throw new HardkasError("TX_SUBMISSION_REJECTED", …)` (the existing catch turns it into a failed step with an `errorEnvelope`), or record `status: "failed"` for that step with the submission id in `producedArtifactId`. Regression: a mocked `submitTransaction` rejection inside `sdk.workflow.run({ steps: [tx.plan, tx.sign, tx.send] })` on a non-simulated network must produce `status: "failed"` for the send step and a `failed` workflow.

## 2. Findings by priority area

### 2.1 Migration trust boundary
- `verifyMigrationSource`: declared version gate, recomputed identity, lineage self-reference check — sound. A tampered v4 (hash mismatch) is refused; a v4 whose *unauthenticated* fields were altered post hoc still "verifies" (by v4 rules) and those fields go to `legacyClaims`, never to the body — correct by IC-4′.7.
- `sealFromVerifiedSource`: strips every path `legacyUnauthenticatedMaterialFields` reports, deletes `artifactId`, recomputes labels, rebuilds lineage from the verified source, enforces a strict post-condition. Sound. Two notes:
  - Path-format mismatch: stripped paths use `steps[0].status`, Zod issue paths use `steps.0.status`, so a required nested field that was stripped falls through to `MIGRATION_RESULT_INVALID` instead of `MIGRATION_UNVERIFIED_REQUIRED_FIELDS`. Still a refusal (fail closed); imprecise code only. **DEFER SAFE** (normalise the comparison).
  - `legacyClaims` is authenticated content named as a claim. No consumer reads it. A future consumer treating `legacyClaims.fields.status` as a status would reintroduce the whitewash; recommend an explicit rule in IC-4′.7's text ("no decision path reads `legacyClaims`") and a source scan for `legacyClaims.fields` reads. **DEFER SAFE**.
- `generateMigrationReceipt`: both hashes recomputed under the declared versions; hex lineage (N13). Sound. The receipt is not bound to the migration function (any writer can mint one) — acceptable only once B1 removes the authority a receipt could confer.
- `migrateArtifactPayload` (0.1.0 → 1.0.0-alpha) now seals through the same routine and refuses unverifiable sources; `execution` is derived from authenticated `mode`/`networkId` — a deterministic function, not a claim. ACCEPT.

### 2.2 Domain digests
- `domainDigest` has no exclusions at any depth; `domainDigestVersionFor` selects by the DECLARED `hashVersion` and throws on invalid. Downgrade is impossible for v5 artifacts because `hashVersion` is authenticated (N11 test still holds); a v≤4 artifact using the legacy digest is LEGACY scope and no decision path consumes its digests: the replay verdict now refuses LEGACY (`REPLAY_LEGACY_AUTH_SCOPE`), the query domain reports insufficient evidence, snapshot restore (`restoreLocalnetSnapshot`) verifies under the declared version (restoring a v4 snapshot is a local convenience, not a security decision). **ACCEPT** §6.1.
- Measured fact worth keeping in view: for the plain localnet data shape the two algorithms coincide; they diverge only when an excluded name (`status`, `createdAt`, `events`, …) appears inside the digested value. That is the N7 defect being removed, not a compatibility risk.
- Residual: the source scan catches only numeric-literal versions. A domain digest computed as `calculateContentHash(value, CURRENT_HASH_VERSION)` over a non-artifact value would pass it. Known remaining case: `packages/testing/src/reproducibility.ts` (`digestCurrent`, reference digests — not security). Recommend extending the scan to flag `calculateContentHash(` on any value that is not a producer's artifact draft. **DEFER SAFE**.
- `packages/sdk/src/pskt.ts` local digest (allow-listed): no exclusions, no algorithm version, re-keying would invalidate persisted `integrityHash` values. **ARCHITECTURE DECISION REQUIRED** (§6.10): keep as an explicitly versioned PSKT session digest or migrate sessions.

### 2.3 SubmissionReceipt / R-iii part 1
- Shape: authenticated `signedArtifactId` (checked equal to `lineage.parentArtifactId`), `txId`, `submitResult`; no post-send state (`SUBMISSION_STATE_FORBIDDEN` rejects `status`, `confirmedAt`, `dagContext`, `acceptingBlockHash`, `confirmations`, and **`endpoint`**). The explicit rejection of `endpoint` is the right guard: a producer cannot silently start asserting an un-ratified normalisation. `rpcUrl` is unauthenticated (IC-1′.1b). **ACCEPT** §6.5 shape.
- Does any decision presuppose that a submission proves the endpoint? Checked: `findExistingSubmission` (identity + `submitResult.accepted` only), `tx-send-runner` (returns the caller's own `rpcUrl`, not the artifact's), `sendOutcome`, `why-narrative`, query adapters. None. `explain`/`hardkas artifact inspect` may print `rpcUrl` as a field; nothing labels it as unauthenticated in prose (docs/narrative debt, Wave 1.5/10). **DEFER SAFE**.
- `SUBMISSION_UNIDENTIFIED_SIGNED`: a real send now refuses an artifact without a verifiable identity. Justified by IC-2′.2 (the submission must reference the signed by artifactId); it is a behaviour change for callers that broadcast hand-built signed objects, in the fail-closed direction. **ACCEPT**, record as compatibility note.
- Rejected submits are recorded and `send()` returns instead of throwing — see **B2** for the consumer that was not adapted. Other callers checked: CLI `tx send` (both sites) exit 1 with `TX_SUBMISSION_REJECTED`; `tx-flow` maps the event status to `failed`; `testing/reproducibility.ts` uses the simulator; `templates/basic.ts` (user template) prints `result.receipt.status` and uses `toBeAccepted()` (see 2.5).
- `txId` ambiguity: `{ tx }` lookups fail closed with `RECEIPT_AMBIGUOUS_CONFLICT` for ≥2 distinct submissions (tested). `findExistingSubmission` returns the first accepted match by path when several FULL accepted submissions share one executed artifact (same signed, same tx): benign. **ACCEPT**.
- Consumers still reading `txReceipt.status` (all display or fail-closed, none accept): `dev-server/src/routes/{replay,overview,observability,transactions}.ts` (UI listings), `tx-builder/src/verify.ts::verifyTxReceiptSemantics` (`accepted && !txId` → adds an error; never accepts), `cli/src/commands/query/ui-helpers.ts` (colouring), `sdk/src/tx.ts::status()` (pre-existing, returns a literal `simulated_confirmed` for `simulated-` ids — an AUX honesty defect predating 1.3, not a 1.3 regression). **DEFER SAFE** for the display sites; flag `tx.status()` for the narrative wave.

### 2.4 Identity model
- `FORBIDDEN_IDENTITY_FIELD` is enforced in both the verifier (FULL branch) and `checkArtifactIdentity` (v5), so a v5 impostor with a top-level `artifactId` is neither verifiable nor resolvable, even by its own identity (fail closed, `CANDIDATE_INVALID`). Legacy artifacts keep the field as unauthenticated material. **ACCEPT**.
- Labels as authority: `parseUntypedLookup` unchanged (labels need a namespace); Silver labels derived at display/file-name time; `kaspa-wallet-runner` no longer fabricates a `planId`/`contentHash`; `sendOutcome` decides from `checkArtifactIdentity`, never from a label. No regression found.
- `deriveWorkflowId`: one function, `kind` inside the digest, ambient `wf_<time>` generators removed. `createTxPlanArtifact` still accepts an explicit `ctx.workflowId` as an opaque correlation label — consistent with IC-7 (CORRELATION never resolves as artifact). **ACCEPT** §6.2.
- `IDENTITY_CATEGORIES` is keyed by leaf name: `PolicySchema.rules[].id` (a rule identifier) is classified `NETWORK` because `id` also names UTXO outpoints. The registry is descriptive (no runtime decision reads it), so this is imprecision, not exposure. **DEFER SAFE** (§6.7: make the registry path-aware).

### 2.5 Legacy boundary
- Decision paths refusing LEGACY/NONE verified in code: `sendOutcome` (CLI verdicts, `--track`, flow events), `findExistingSubmission`, query replay divergences/invariants, `sdk.replay.verify` (`REPLAY_LEGACY_AUTH_SCOPE`), strict verification (`MIGRATION_REQUIRED`), reference checks (`checkReference` runs strict integrity → a legacy policy/profile/assumption reference is refused).
- Gap inherited from 1.2, relevant to 1.4: the **parent** of a v5 artifact is resolved and verified by *semantics* recursion only; a LEGACY parent plan is accepted in a strict chain, so `simulate`/`send` of a v5 signed whose parent is a legacy (rc.22) plan executes over a LEGACY plan. IC-6′.2 (1.4) requires resolving the plan by artifactId and verifying it: that verification must be strict (refusing LEGACY), otherwise IC-4′.4 is violated at the binding point. **ARCHITECTURE DECISION REQUIRED for the 1.4 design** (recommended: strict; re-issue legacy plans with `artifact migrate --to 5` before signing).
- `@hardkas/testing` matcher `toBeAccepted()` = `received.status === "accepted"` with no authentication scope; it is a public assertion helper users copy from `templates/basic.ts`. Not a decision path of the product, but a public surface that will read a legacy/forged status as success. **DEFER SAFE** (route it through `sendOutcome`-like logic; Wave 1.5 or the testing wave).

### 2.6 Silver
- Records are now sealed at v5 by the canonicaliser; nested `{ path, contentHash, artifactSha256 }` references are authenticated. The references written by `hardkas silver deploy|spend|covenant transition` are built only from records the command itself loaded and verified (`readRecord` → `checkArtifactIdentity`; `readReferencedRecord` → `verifySilverRecordReference`, which checks the target's recomputed identity and crosses `artifactSha256`). A nested `contentHash` is therefore an authenticated pointer whose target is verified at every read, not a claim that the target was validated when written. **ACCEPT**.
- Legacy v4 records keep their stored label and unauthenticated nested references (LEGACY scope; the 1.2 reference check still crosses the digest). No new exposure.
- The Silver bookkeeping simulator now refuses a claimed `contentHash` that does not recompute (`SILVERSCRIPT_PLAN_HASH_MISMATCH`) and seals receipts with a hexadecimal lineage; it remains labelled "never evidence". **ACCEPT**.
- The silverc-level suites were not executed (toolchain absent in the baseline); record sealing is unit-tested. **DEFER SAFE** — must run before any public-chain claim (§6.12).

### 2.7 Scope check
No widening beyond Closure Pack / IC text found. Program-wide `allowExcessArguments(false)` is the literal AUX-08 ("y resto de comandos commander"). The `@hardkas/simulator → @hardkas/artifacts` dependency (lockfile importer only) is the minimal way to remove a duplicated canonicaliser (IC-1′). The regenerated `docs/reference/cli.md` also absorbs the un-regenerated Wave 1.2 deltas (explain/why flags): documentation catch-up, not scope.

## 3. Verdict on the 12 derived decisions (ledger §6)

| # | Decision | Verdict |
|---|---|---|
| 6.1 | digest algorithm keyed by declared `hashVersion`, no `digestVersion` field | ACCEPT |
| 6.2 | single `workflowId` derivation over typed intents; ambient generator removed | ACCEPT |
| 6.3 | migration without whitewash; refuse when a required field was never authenticated; `execution` derived | ACCEPT (imprecise refusal code for nested paths: DEFER SAFE) |
| 6.4 | missing parent tolerated under a FULL MigrationReceipt (`PARENT_MIGRATED` / `MIGRATION_SOURCE_ABSENT`) | **SECURITY DEFECT (B1)** + ARCHITECTURE DECISION REQUIRED (source stays in store, marked superseded) |
| 6.5 | submission shape; `endpoint` absent (blocked); rejected submit recorded, `send()` returns `submitted:false` | ACCEPT shape and `endpoint` handling; **SECURITY DEFECT (B2)** in the un-adapted workflow consumer |
| 6.6 | legacy status never decides (listed sites) | ACCEPT; DEFER SAFE for `testing` matcher and `tx.status()` |
| 6.7 | identity-category names | DEFER SAFE (path-aware registry) |
| 6.8 | containment only for `hardkas verify [path]`; commander exit code for excess args | ACCEPT |
| 6.9 | AUX-03 defaults (SDK non-strict, `authScope` shown) | ACCEPT (D-Q21) |
| 6.10 | PSKT session digests left as-is | ARCHITECTURE DECISION REQUIRED |
| 6.11 | ZK corpus on explicit legacy digest | DEFER SAFE |
| 6.12 | Silver CLI records not exercised at silverc level | DEFER SAFE (mandatory before public-chain claims) |

## 4. Verdict

`BLOCK_WAVE_1_4`

Two blockers, both small and both inside Wave 1.3's own scope:
- **B1** removes an authority that IC-5′.6 never granted (a reference that resolves to nothing must fail); the fix is a deletion plus a source-side `SUPERSEDED_BY_MIGRATION` info in store verification, with the forgery above as the regression.
- **B2** restores fail-closed behaviour in the one `send()` consumer that was not adapted to recorded rejections.

Everything else is `ACCEPT`, `DEFER SAFE`, or an `ARCHITECTURE DECISION REQUIRED` that does not block 1.4 (PSKT digest versioning; whether a legacy source may leave the store; strictness of the parent-plan verification at the 1.4 binding point — recommended strict).

STOP. Nothing was implemented.
