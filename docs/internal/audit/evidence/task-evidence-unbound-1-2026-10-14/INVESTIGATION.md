# TASK-EVIDENCE-UNBOUND-1 — investigation and BEFORE (2026-10-14)

L1-REALITY-1 E1′: `hardkas task pay --evidence` paid for real on an isolated simnet node (tx `2413fa30…c888`,
confirmed), and the package it wrote (`pay.hke.json`) verified — `EVIDENCE_VERIFIED` — while carrying **zero** artifacts
of that payment.

Tree: `C:\Users\jrodr\hkl1\teu\src` = published develop `e14138477` + the delivered SECURITY-INTEGRATION-1 patch
(sha `1d12fe26…`, tree `64d9b986` verified), installed and built. Investigation + BEFORE only: no fix, no commit.

## 1. The path, step by step

| Step | Where | What exists | Bound how |
|---|---|---|---|
| task | `packages/cli/src/commands/task.ts` | opens the SDK, runs `actionFn(args, hk)`, writes a scenario result, optionally packs | — |
| plan | `hk.tx.plan` → store `*.plan.json` | `hardkas.txPlan`, v5 | its contentHash |
| signedTx | `hk.tx.sign` → `signed/signedTx-*.json` | `lineage.parentArtifactId` = plan | **authenticated** (v5 hashes `lineage.*` except `lineage.artifactId`) |
| submission | `hk.tx.send` → `receipts/txSubmission-*.json` | `lineage.parentArtifactId` = signed, `lineage.rootArtifactId` = plan, `signedArtifactId` | authenticated |
| observation | only if the task (or `tx wait`) observes → `observations/txObservation-*.json` | `subject.submissionArtifactId`, `subject.txId`, the node's findings (`point`, `finding`, `evidence[]`) | authenticated; content = what the RPC node reported |
| scenarioResult | `task.ts:125` `createScenarioResultArtifact({...})` | `status`, `networkId`, `mode`, `artifactsGenerated`, `metadata.result` | its contentHash covers all of them |
| evidence pack | `packages/sdk/src/evidence.ts` `EvidenceManager.pack` | carries exactly the artifacts the scenario result names (`artifactsGenerated`) | membership bound by the scenario result's hash |
| verify | `EvidenceManager.verify` | see §3 | — |

E1′ store, read-only (`scripts/lineage-map.mjs`): plan `ef066ca4` ← signed `b235234a` (parent) ← submission `5cedec89`
(parent signed, root plan) ← observation `cd449cee` (`subject.submissionArtifactId`, written by the later `tx wait`). The
chain **exists, linked by authenticated references**.

## 2. Where it is lost (root cause)

`task.ts:125` creates the scenario result **without `artifactsGenerated`**. Nothing records what the task wrote. The
packer, by design since SURFACE-TRUTH-1A, carries exactly what the scenario names: nothing. The payment survives only
as *informative* text inside `metadata.result` (the task's return value: plan/signed hashes, txId), which no verifier
resolves. The testing scenario runner (`packages/testing/src/scenarios.ts`) does collect them: it listens to the
`artifact.written` events (EVENT-LEDGER-2 D4) while the scenario runs. The task command never adopted that.

Neighbours found on the same path:
- **Mode label.** `task.ts` uses `scenarioModeForNetwork(network)`, which maps simnet → `"localnet"` whatever ran;
  the payment ran in `rpc` (its own artifacts say `mode: rpc`). The package therefore repeats a mode that did not run.
- **Pack failure swallowed.** `task.ts:152` catches a pack error, prints `Failed to pack evidence`, and the command
  ends `ok: true`, exit 0.
- **Hard-coded version.** `evidence.ts:91` writes `hardkasVersion: "0.12.0-rc.27"` into every package; it is not
  hashed, but it is false on any other release.
- **Failed tasks leave nothing.** A failed task leaves no scenario result and no package (`TASK_FAILED`, exit 1). This
  is coherent today (no false "passed"), but a failed run cannot be evidenced. It is recorded, not a defect.

## 3. What `EVIDENCE_VERIFIED` asserts today — and what it does not

`EvidenceManager.verify` returns `EVIDENCE_VERIFIED` when all of these hold:
1. the package schema is `hardkas.evidencePackage.v1`, and no claim (mainnet/testnet/production/bridgeReady/onchainZk)
   is set, in the package or in its scenario result;
2. the scenario result is a sealed, intact v5 artifact — **integrity of the verdict record** (status, network, mode,
   `artifactsGenerated`, metadata);
3. the package repeats its name, networkId and mode;
4. every carried artifact hashes to its declared identity — **integrity of each artifact**;
5. the carried set equals `artifactsGenerated` (no extra, no missing, no duplicate, the hash list agrees) —
   **membership, relative to what the scenario result names**.

It does **not** assert:
- **non-vacuity.** 0 named + 0 carried passes (TEU-4a): "verified" says nothing about a payment.
- **lineage.** A carried artifact's authenticated parent (`lineage.parentArtifactId`, `signedArtifactId`,
  `subject.submissionArtifactId`) need not be in the package; a signed transaction and its submission without their
  plan verify (TEU-4b). The links are inside the hashes, but the verifier never follows them.
- **authorship.** The package is unsigned. A forger who edits an artifact, re-seals it, renames it in a re-sealed
  scenario result and rewrites the hash list produces a package that verifies (TEU-4e). It proves internal
  consistency, not who produced it. This is stated in `evidence.ts` already.
- **chain inclusion.** Nothing in a package is a proof of inclusion (no headers, no merkle path). An observation records
  what one RPC observer reported (its `observer` is self-described, and the node's own word is NNI's limit too). A
  submission records that HardKAS sent a request and what the node answered.
- **the verdict.** `status: "failed"` is not refused; the verifier checks the record, not that the run passed.

The CLI's human line, «EVIDENCE_VERIFIED: The package is valid and structurally sound.», does not name the artifact count
or these limits.

## 4. BEFORE (hermetic, a fake node on loopback that declares simnet and accepts submissions)

`packages/cli/test/task-evidence-unbound-1.test.ts`, run `teu-before-1` (0 non-loopback connections): **3 failed / 3 passed**,
as designed.

| Case | Expectation | BEFORE |
|---|---|---|
| TEU-1 `task pay --evidence` | the package carries plan, signed, submission; the scenario names them | **FAIL**: the store holds the chain (`d3fd2c1f` ← `a9c8e412` ← `0b18625f`, linked), the package carries 0, names 0 |
| TEU-2 mode | scenario `mode` = the mode that ran (`rpc`) | **FAIL**: `localnet` (package and scenario), artifacts say `rpc` |
| TEU-3 pack cannot be written | non-zero exit, typed code | **FAIL**: exit 0, `ok: true`, stderr «Failed to pack evidence» |
| TEU-4 characterization of verify | pins §3 | pass: empty → VERIFIED; missing parent → VERIFIED; edited → `ARTIFACT_HASH_MISMATCH`; dropped → `MEMBERSHIP_MISMATCH`; re-sealed forgery → VERIFIED |
| TEU-5 failed task | recorded | pass: exit 1 `TASK_FAILED`, 0 scenario results, no package |
| TEU-6 task without `--network` | recorded | runs on the workspace's default (simnet, node contacted); scenario mode again `localnet` |

## 5. Minimal proposal (as submitted for decision; implemented in §6)

Core of the fix (`packages/cli/src/commands/task.ts`, plus one line in `evidence.ts`):

- **P1 — record what the task wrote.** While `actionFn` runs, collect the `artifact.written` events this process
  announces (the mechanism the scenario runner already uses), and seal them as `artifactsGenerated`. The scenario
  result itself is excluded.
  - Check in the fix: a write-once hit (the identical artifact already in the store) must still be named. If the store
    does not announce it, the task names the identities the SDK returns.
- **P2 — the mode that ran.** Use `hk.execution.mode` (the instance's resolved execution), not a label derived from
  the network name.
- **P3 — pack failure fails the command.** A typed `EVIDENCE_PACK_FAILED`, non-zero exit; the scenario result stays
  written and its path is reported.
- **P4 — no hard-coded version.** `hardkasVersion` from `HARDKAS_VERSION`.

Decisions for the reviewer (each changes what `EVIDENCE_VERIFIED` means; not needed for the core fix):

- **D-TEU-1 lineage closure.**
  - The change: `verify` also follows the authenticated references of every carried artifact and refuses a package
    where one does not resolve inside it (e.g. `EVIDENCE_LINEAGE_INCOMPLETE`).
  - Cost: packages naming partial sets stop verifying (the scenario runner's included).
  - Alternative: report it as a scope field, `lineage: "closed" | "open"`, instead of refusing.
- **D-TEU-2 vacuity.** The options:
  - refuse to pack a task whose run wrote nothing;
  - or keep `EVIDENCE_VERIFIED` but always report `artifacts: n` (JSON and human line).

  Recommendation: report always; refuse only when the task's own output names artifacts that are not carried.
- **D-TEU-3 wording.** Keep `EVIDENCE_VERIFIED` but state its scope everywhere: "integrity + membership [+ lineage];
  unsigned; not a proof of chain inclusion". It must never be presented as on-chain proof (TN10 included).
- **D-TEU-4 failed tasks.** Optionally seal a `status: "failed"` scenario result with what was written before the
  failure, so failed runs can be evidenced too.

Out of scope here: signing packages (authorship), inclusion proofs, TQ-1.

## 6. Implementation (review 2026-10-14: GO P1–P4, decisions D-TEU-1..4)

Decisions: D-TEU-1 a package claims a complete payment only when its lineage closes inside it; D-TEU-2 an empty package
only when declared empty, never as payment evidence; D-TEU-3 `EVIDENCE_VERIFIED` = integrity + internal consistency, not
chain inclusion nor external authenticity; D-TEU-4 a failed task keeps sealed evidence of its failure.

| Condition | Where | What |
|---|---|---|
| 1 only this run | `sdk/src/artifacts-manager.ts` `record()` / `noteStored()` | a recording on the SDK **instance** the task is lent: every identity that instance puts in (or finds already in, write-once) the store, in order; not the process bus, not the workspace. The simulated receipt (written by the durable commit, not by `write()`) is noted where it is announced (`tx.ts`). Exports (`outputDir`) and dry runs are not recorded |
| 2 lineage | `sdk/src/evidence.ts` | `verify` follows the authenticated references of every carried artifact (`lineage.parentArtifactId`, a submission's `signedArtifactId`, an observation's `subject.submissionArtifactId`) and reports them (`scope.lineage`, `scope.unresolved`). A **payment claim** is verified only when, for each claimed payment, submission → signed → plan resolve inside the package with consistent `txId`, lineage root and network, and no carried artifact points outside it: else `EVIDENCE_PAYMENT_INCOMPLETE`. Packages without a payment claim keep verifying with `lineage: open` reported |
| 3 kinds of task | `artifacts/src/scenario-result.ts`, `schemas.ts`, `cli/src/commands/task.ts` | the scenario result seals `evidenceClaim`: `none` (wrote nothing) / `artifacts` / `payment` (`payments: [{ txId, submissionArtifactId }]`, from the submissions the run wrote). The shared producer defaults to `none`/`artifacts`, never `payment`. `verify`: an empty package passes only with `none` (`EVIDENCE_EMPTY_UNDECLARED` otherwise, the E1′ shape); `none` with artifacts or `artifacts`/`payment` without → `EVIDENCE_CLAIM_INCONSISTENT` |
| 4 effective mode | `task.ts` | `hk.execution.mode` (the instance's resolved execution), not `scenarioModeForNetwork(network)` |
| 5 pack failure | `task.ts`; `evidence.ts` | typed `EVIDENCE_PACK_FAILED`, exit 1, `ok:false`, the scenario result stays and is named. `pack` verifies the package it is about to write and refuses one that would not verify |
| 6 one version source | `evidence.ts` | `hardkasVersion: HARDKAS_VERSION` (no literal); no identity or historical evidence touched |
| 7 failed tasks | `task.ts` | the run is sealed `status: failed` with `error {code, message, component}` — the message through `maskSecrets`, `args`/`result` through `redactSecretFields` (both runs) — named artifacts and claim as for a passed run; packed with `--evidence`; the command still fails `TASK_FAILED` |
| D-TEU-3 wording | `evidence.ts` `evidenceScopeStatement`, `cli/src/commands/evidence.ts` | every verdict carries `scope` (`artifacts`, `claim`, `verdict`, `lineage`, `unresolved`, `payments[{txId, complete, plan, signed, submission, submitAccepted, observations[{finding, confirmationsBlue, observer}]}]`, `statement`). Human line: `EVIDENCE_VERIFIED: N artifacts, claim …, run …, lineage …; payments…` + the statement «… Not a proof of inclusion on chain, nor of who produced the package; an observation records what one RPC observer reported.» |

A payment's observation is carried when the task observes it (the test task calls `hk.tx.observe`); `verify` reports it as
what one RPC observer reported (`finding`, confirmations), never as inclusion. Submitted ≠ accepted ≠ observed: each is
reported separately (`submitAccepted`, `observations`).

Not changed: the scenario runner of `@hardkas/testing` still collects through the process event bus (a test framework,
one scenario per fixture); the generated SDK reference under `apps/docs/.../generated` is produced at docs build and
was not edited by hand (it will show the new `EvidenceVerifyResult` fields when regenerated).

## 7. Results

Test file v2 (`packages/cli/test/task-evidence-unbound-1.test.ts`, 14 cases; the v1 run `teu-before-1` is kept above).

| Run | Result |
|---|---|
| BEFORE final (`teu-before-final`: v2 against the same base without the fix, the built `hkl1\si` tree; test copied in and removed) | **0/14** |
| AFTER (`teu-after-3`) | **14/14** |
| Related packages (`artifacts`, `sdk`, `core`, `testing`, `query-store`, `query`, `accounts`) | 1,429 passed / 0 failed / 6 skipped |
| Related CLI (23 files: tasks, surface-truth, help-truth, cli-contract, evidence-trust, event-ledger, workflow, security-integration, …) | 211 / 0 / 19 |
| Typecheck (artifacts, sdk, cli, testing + deps) | pass |
| `docs:check-cli` | up to date |
| Non-loopback connections | 0 |

AFTER traces (`traces/teu-after-3/`):
- **TEU-1** — the package carries plan `←` signed `←` submission `←` observation (4 artifacts). `scope`: claim
  payment, lineage closed, one payment complete, submitAccepted true, one observation.
- **TEU-8a** — one payment artifact omitted, everything re-sealed consistently → `EVIDENCE_PAYMENT_INCOMPLETE`.
- **TEU-8b** — lineage manipulated (the signed transaction re-parented, submission/observation/scenario re-sealed) →
  `EVIDENCE_PAYMENT_INCOMPLETE`.
- **TEU-8c** — the E1′ shape (empty, undeclared) → `EVIDENCE_EMPTY_UNDECLARED`.
- **TEU-8d** — a no-payment package with an open lineage → still `EVIDENCE_VERIFIED`, `lineage: open` with the missing
  plan named.
- **TEU-4** — edited → hash mismatch; dropped → membership mismatch; a re-seal that keeps the chain closed → verified,
  and the statement says the package is unsigned.
- **TEU-7** — another instance of the same process planning in the same workspace during the task: its plan is not named.
- **TEU-9** — noop and plan-only (a plan is stored only once signed) → `none`; sign-only → `artifacts` (2), no payment.
- **TEU-10** — failed task: sealed `failed`, names its 2 artifacts, packed and verifiable as a record of the failure, no
  secret anywhere, exit 1 `TASK_FAILED`.
- **TEU-3** — pack failure → exit 1 `EVIDENCE_PACK_FAILED`, the scenario result kept.
- **TEU-2/TEU-6** — mode `rpc`.
- **TEU-11** — CLI JSON scope and human statement.
- **TEU-12** — version from `HARDKAS_VERSION`.

Note on the test fake: a node answers `submitTransaction` with the id of the transaction it received. The first AFTER run
used a fake that answered a fixed id; the verifier refused the package because the submission's txId (the node's answer)
disagreed with the signed transaction's. That is the right verdict for such a node. The fake now computes the real id.

## 7b. Review round 2 (ACCEPT técnico; GO to prepare the integration, not to apply it)

Two more requirements, still in `hkl1\teu`:

- **Two runs on the SAME SDK instance.**
  - BEFORE (`teu-r2-before`, TEU-13): two overlapping recordings on one instance crossed. Each named the other's
    plan and signed transaction (`aNamesB: true, bNamesA: true`).
  - An instance cannot tell which of two overlapping runs made a write, so `record()` now refuses a second recording
    while one is open: typed `ARTIFACT_RECORDING_BUSY`, which asks for one instance per concurrent run.
  - Sequential recordings on one instance stay separate.
  - The CLI runs one task per process, so the refusal never applies there.
- **The package verdict and the RPC observation stay separate.**
  - Renamed `payments[].complete` → `lineageClosed` and `observations` → `rpcObservationsReported`, documented as
    reported, not part of the verdict, not checked against the network.
  - The human output now gives separate lines: the verdict (`EVIDENCE_VERIFIED: …, lineage closed.`); per payment,
    "plan, signed and submission linked inside the package" plus what the node answered to the submission; a separate
    «RPC observations carried, as one observer reported them (not checked against the network by this command)»
    line; then the statement.
  - No line says "payment proven" (TEU-11 asserts it).

Runs: `teu-r2-before` 12/15 (TEU-1, TEU-11, TEU-13 fail) → `teu-r2-after` **15/15**; related re-run `teu-related-*-2`.

### Integration plan (prepared, not executed)

The order is the reviewer's: SECURITY-INTEGRATION-1 is published by the owner first.

1. Run `scripts/integrate-teu.ps1 -Commit <published SI commit> -Patch <this wave's patch> -ExpectedFullTree <manifest FULL>`.
   - It checks that the published commit is the qualified tree `64d9b986` on `e14138477`, and stops otherwise.
   - It builds a new isolated tree from it (`hkl1\teu2`, `git archive`; the owner's checkout is only read) and applies
     the patch.
   - It requires exactly the 8 expected code/test paths plus this evidence folder, and the qualified resulting tree.
   - Then install + build.
2. Run the wave's tests, the related batches and the typecheck in that tree.
3. Real Golden Path, `scripts/realnode-teu.ps1 -Src <tree>`, on the own simnet kaspad `hkl1-kaspad`:
   - `task paycheck --evidence`: plan, sign, send, then observe until CONFIRMED;
   - `evidence verify`;
   - an independent raw-wRPC check of the node state.

   The three results are reported separately: the package verdict, the RPC observation it carries, and the raw node
   check.
4. Final qualification, then hand-off for the owner's commit. Nothing is published automatically.

## 7c. Integration on the published SECURITY-INTEGRATION-1 and real Golden Path (2026-10-14)

The owner published SECURITY-INTEGRATION-1 as `b2a137878` (tree `64d9b986`, parent `e14138477`).

`scripts/integrate-teu.ps1` (`logs/integrate-summary.txt`):
- checked the commit;
- built `hkl1\teu2` from it with `git archive`, matching tree `64d9b986`;
- applied this wave's m2 patch (sha `e00c2b05…`): exactly the 8 expected code/test paths plus 162 evidence paths,
  resulting tree `cc8a1c68` = the qualified FULL tree;
- install and build passed.

| Run in `hkl1\teu2` | Result |
|---|---|
| The wave (`teu2-wave-1`) | **15/15** |
| Related packages (`teu2-related-pkgs-1`) | 1,429 / 0 / 6 |
| Related CLI (`teu2-related-cli-1`) | 208 / 4 failed / 19 — the 4 cases (EA-8, EA-8u, EA-8c, SI-7) load `packages/testnet-qualification/dist`, which the integration build had not built (cli/sdk scope); after building it, `teu2-related-cli-1b` (those two files) **31/31** |
| Typecheck (artifacts, sdk, cli, testing + deps), `docs:check-cli` | pass |
| Non-loopback connections | 0 |

Not run: `templates:verify` (it `npm install`s generated projects from the public registry, an external connection not
authorized here); the `scenario-evi-02/03` qualification gates (they need a public-npm consumer and the canonical Docker
localnet; EVI-02 packs an unsealed hand-written scenario result, which `pack` refuses since SURFACE-TRUTH-1A, before this
wave). In the repository, `evidence verify` consumers read only `ok`/`status`. The renamed scope fields were introduced by
this wave and never published, since the published `evidence verify` JSON carried only `status`. The one behaviour change
for old packages: an empty, undeclared one is now `EVIDENCE_EMPTY_UNDECLARED` (D-TEU-2).

**Real Golden Path** (`scripts/realnode-teu.ps1 -Src hkl1\teu2\src`, run `realnode/rn-2/`). It ran on the own simnet
kaspad `hkl1-kaspad` (rusty-kaspa 2.1.0, host 28210) with the `hkl1-miner` miner. Docker Desktop had to be started; the
containers were stopped afterwards. The task `paycheck --evidence` planned, signed, sent and observed until CONFIRMED.
Three results, kept separate:

1. **The package verdict** (`evidence verify`):
   - `EVIDENCE_VERIFIED`, 5 artifacts, claim payment, run passed, lineage closed;
   - the payment tx `a9c742ee694d5e3ca09d0bf04d7eada1613f0deac7800a0be25e59322b258bc8` has its lineage closed:
     plan `8eb6cc25` ← signed `d60d5803` ← submission `4faffa52`.
2. **What the node and its RPC observer said, as carried in the package** (reported, not verified against the network by
   `evidence verify`):
   - the submission was accepted;
   - observation `764a7cfb` reported `mempool_entry`;
   - observation `57ae5c0a` reported `chain_accepted`, 130 blue confirmations; the task's derived state was CONFIRMED.
3. **Independent check of the node state** (raw wRPC, no HardKAS code): `getUtxosByAddresses(bob)` holds an output of
   `a9c742ee…8bc8`.

None of the three alone is presented as "payment proven". The package remains unsigned. The chain facts come from the
own node (its RPC); there is no inclusion proof.

## 8. Residual and out of scope

- Authorship: packages are unsigned; a forger who rebuilds a consistent closed chain produces a verifying package (TEU-4).
- Chain inclusion: no proof in a package; observations are RPC reports (NNI's "declared, not authenticated" limit applies).
- Recording scope: per SDK instance, one recording at a time (a second is refused `ARTIFACT_RECORDING_BUSY`).
  Concurrent runs need one instance each. Run-scoped recording on a shared instance (async context) is possible later
  if a concurrent consumer appears.
- Packages sealed before this change: a non-empty one verifies with `claim: unspecified`; an empty one no longer verifies
  (`EVIDENCE_EMPTY_UNDECLARED`), by D-TEU-2. No historical file was modified.
- Generated SDK reference docs: regenerate at the next docs build.

## 9. Files

Code:
- `packages/artifacts/src/scenario-result.ts`
- `packages/artifacts/src/schemas.ts`
- `packages/sdk/src/artifacts-manager.ts`
- `packages/sdk/src/evidence.ts`
- `packages/sdk/src/tx.ts` (one line)
- `packages/cli/src/commands/task.ts`
- `packages/cli/src/commands/evidence.ts`

Test: `packages/cli/test/task-evidence-unbound-1.test.ts`.

This folder:
- `logs/`
- `traces/` (`teu-before-1`, `teu-before-2`, `teu-before-final`, `teu-after-1..3`)
- `scripts/` (setup, run-tests, run-related, build, lineage-map)
- `tests/` (v1 and v2 of the test)
