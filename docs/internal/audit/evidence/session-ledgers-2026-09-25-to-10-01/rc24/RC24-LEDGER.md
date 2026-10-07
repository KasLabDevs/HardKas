# rc.24 Demo-Ready — ledger

## 1. Baseline

- Start (2026-09-28): branch `develop`, HEAD `de6b2da7d` = `origin/develop`. Uncommitted: first-contact block + demo-cut Step 2 (mine) and the `packages/pskt-native` manifests (not mine: written by `napi prepublish` during the rc.23 publish).
- Snapshot of every tracked/untracked file: `rc24/baseline-tree.json` (3429 files), `rc24/baseline-status.txt`, `rc24/baseline-tracked.patch`.
- **Mid-task** the owner committed and pushed `ad1fa86ca [KLD]: 0.12.0-rc.24 version` (10:50 +0200): the two blocks, **including `packages/pskt-native/package.json` with the AUD-01 optionalDependency**. No version fields changed. From then on HEAD = `ad1fa86ca` = `origin/develop`, and HEAD itself carries AUD-01.

## 2. AUD-01 — packaging

Investigation:
- `packages/pskt-native/package.json`: `prepublishOnly: napi prepublish -t npm --skip-optional-publish` — the only publish-lifecycle script in the whole monorepo.
- `@napi-rs/cli` 3.8.2 `prePublish`: rebuilds the root `optionalDependencies` from the napi targets (`resolveRootOptionalDependencies`) and writes it; `--skip-optional-publish` skips publishing the platform packages; `--gh-release` defaults to true (creates a GitHub release + uploads assets when `GITHUB_TOKEN` is set — not verifiable here, `gh` is not installed). It also leaves `.prepared.tmp` / `.retired.tmp` files in the package directory (ignored by git; present now).
- npm 11.12.1 `publish.js`: `prepublishOnly` runs only for directory publishes and **also under `--dry-run`**; `npm pack` never runs it. So a packed tarball looks clean while the real publish rewrites the manifest.
- Registry: `@hardkas/pskt-native@0.12.0-rc.23` declares `optionalDependencies: {"@hardkas/pskt-native-win32-x64-msvc": "0.12.0-rc.23"}`; that package does not exist (404, any version).
- Runtime loader `packages/pskt-native/index.js`: loads `./hardkas-pskt-native.<platform>.node` from its own directory, then `./hardkas-pskt-native.node`; it never requires the platform package. `files` ships `*.node`. `@hardkas/sdk` declares pskt-native as an optionalDependency and imports it lazily in a try/catch.
- The platform package directory `npm/win32-x64-msvc/` is not a workspace package (globs are `packages/*`).

Reproduction: `pnpm install --frozen-lockfile` → `ERR_PNPM_OUTDATED_LOCKFILE` (pskt-native manifest). Regression test `packages/testing/test/demo-ready-aud01-packaging.test.ts` before the fix: 2 failed / 2 passed —
`packages/pskt-native optionalDependencies @hardkas/pskt-native-win32-x64-msvc` and `packages/pskt-native prepublishOnly: napi prepublish -t npm --skip-optional-publish`.

Fix: remove the `prepublishOnly` hook and the generated `optionalDependencies` block (manifest otherwise identical to its pre-publish form). After: test 4/4; `pnpm install --frozen-lockfile --lockfile-only` exit 0 (note: `--lockfile-only` rewrites `pnpm-lock.yaml` with LF endings even when frozen — content identical; restored with `git checkout`).

## 3. E02 — planning on a live DAG

Property (ratified): planning validity is UTXO-scoped, not virtual-state-scoped.

Root cause: `packages/cli/src/runners/tx-plan-runner.ts` discarded every attempt whose virtual fingerprint (DAA score + sorted virtual parents + sink) differed before/after planning — between the two reads there are several RPCs and the Generator — and threw `UTXO_VIRTUAL_STATE_UNSTABLE` after 3 attempts. The SDK path has no such guard.

Reproduction:
- unit `packages/cli/test/demo-ready-e02-live-dag-planning.test.ts` before: 6/6 failed (A/B-retry/C-retry: UTXO_VIRTUAL_STATE_UNSTABLE; B/C fail-closed: wrong code; control: no evidence).
- real node (`rc24/e02-before.log`): `localnet fund minera1 --keep-miner` then `tx plan` ×3 → 3/3 `UTXO_VIRTUAL_STATE_UNSTABLE`.

Fix: the fingerprint equality no longer decides. Each attempt ends by re-reading the address UTXO set and the sender's mempool (`observePendingSpends` again); selected input missing or pending ⇒ retry; retries exhausted ⇒ `SELECTED_UTXO_INVALIDATED` (`SelectedUtxoInvalidatedError`, @hardkas/core; lists missing/pending outpoints; scoped to "the observed mempool"). Evidence recorded in the plan: `metadata.planningWindow` {validity "utxo-scoped", attempts, before/after DAA + fingerprint, revalidation counts, scope observer-local} (RuntimeContext field + projection in createTxPlanArtifact). Generator upstream, pending-spend evidence, maturity on the snapshot and bounded retries unchanged. Docs: `apps/docs/.../utxos.md`, `error-model.md`; `PUBLIC_API_SURFACE.md` lists the new error.

Tests after: E02 unit 6/6 (A, control, B fail-closed, B retry, C fail-closed, C retry) — one assertion of my new test A corrected (it assumed the Generator picks one specific UTXO; selection is upstream's business). Re-baselined `wave2-b-planner-convergence.test.ts` T-A17a: "Safety layer 1" asserted `UtxoVirtualStateUnstable` for a moving DAG — i.e. it encoded the E02 defect as a property; now asserts the plan succeeds with `planningWindow`. Its "Safety layer 2" passed vacuously (the scripted node, keyed on the DAG-read count, returned `[]` on the FIRST UTXO read → "No UTXOs found", never reaching the confirmation); the model now counts UTXO reads and the case asserts `SELECTED_UTXO_INVALIDATED`, attempts 3. Affected files (wave2-b, wave2-c, execution-guard-runners, simulated-isolation, localnet-fund-race): 21 passed / 2 skipped (live).

Real node after (`rc24/e02-after.log`): `tx plan` ×3 with the miner running → 3/3 exit 0.

## 4. Found while qualifying E02 — unthrottled companion miner (LOCALNET-MINER)

In `e02-after.log` the plans needed 2–3 attempts and a plan signed ~30 s later was refused by the node: "transaction … is an orphan where orphan is disallowed". Measured (`rc24/utxo-churn.*`, read-only RPC polling):
- `localnet fund --keep-miner` (unthrottled cpuminer): whole sets of the mining address's coinbase outpoints leave and come back between 1-second reads (e.g. 395 gone / 407 new / later REAPPEARED=395), 1705 distinct outpoints left in 15 s; after stopping the miner the view keeps changing until the node settles (`churn1.log`); on a restarted, settled node the same address answers 3636 identical entries 6/6 (`raw1.log`).
- same miner by hand with `--throttle 100` (`churn-t100.log`) and `--throttle 5` (`churn-t5.log`): 0 outpoints left the set.
- The repo's own real-node harnesses already run this miner with `--throttle` (default 5 ms, `HARDKAS_TOCCATA_MINER_THROTTLE_MS`, documented as harness-local, not a protocol parameter); only the CLI's `localnet fund` ran it unthrottled.

Fix: `toccataMinerArgs()` in `packages/cli/src/runners/localnet-runners.ts` adds `--throttle 5` (env override, `0` disables, non-numeric ignored). Test `packages/cli/test/demo-ready-localnet-miner-throttle.test.ts` 0/2 → 2/2. Real node with the CLI's own `--keep-miner` (`churn2.log`): 0 outpoints left in 15 s of mining, settled set identical 5/5.

Full lifecycle with continuous mining (`e02-after2.log`): plan ×3 → attempts 1 each while the DAA moved (1444→1455, 1851→1867, 2275→2310); plan1 signed and sent ~15 s later → submitted; `tx status` ACCEPTED (73); `tx wait --until confirmed` → CONFIRMED (300 ≥ 100); `verify` FULL; `tx send --from` → submitted.
Limitation (kept as a documented limitation, not changed): at ~100 DAA/s the node's UTXO index trails acceptance by seconds — `accounts balance ana1` read 0 KAS right after CONFIRMED; the settled node shows 15 KAS / 2 UTXOs (`balance-after.log`). With `HARDKAS_TOCCATA_MINER_THROTTLE_MS=50` (~10 DAA/s, Kaspa's pace, `e02-t50.log`) the balance is right immediately but `localnet fund` takes ~115 s (coinbase maturity ≈ 1000 DAA on this 10-BPS simnet).

## 5. First-contact polish

**E20 — names.** Root cause: `packages/cli/src/commands/accounts.ts` built `{ count: parseInt(options.count), ...options }`; commander's string `"1"` overwrote the number, so the runner's `count === 1` never matched and `--name ana` became `ana1`. Also found: a taken name in encrypted mode overwrote the existing account's keystore before the store refused the duplicate (pre-fix evidence, `rc24/e20-overwrite-check.cjs`: keystore sha a4e74ef5… → 21c2ee6a…, then "Account with name 'cleo1' already exists" — the stored account now points at a keystore holding another key). Fix: options spread first; names computed once; taken names (store, case-insensitive, or an existing `.hardkas/keystore/<name>.json`) refused with `ACCOUNT_NAME_TAKEN` (exit 2) before any prompt or write. Test `demo-ready-e20-account-names.test.ts` 1/4 → 4/4 (exact name; `--count 2` → ben1, ben2; plaintext collision leaves the account untouched; encrypted collision leaves the keystore byte-identical). One assertion of the new test fixed (it parsed JSON out of stdout+stderr).

**E27 — init message.** `init.ts` printed `Created: test/payment.scenario.ts` for `test/payment.test.ts`; it now prints the path it wrote. Test `demo-ready-e27-init-messages.test.ts` (every `Created: <path>` exists) 0/1 → 1/1; newcomer + scaffold-versions 15/15.

**E21 — plan path.** Without `--out`, `tx plan` persisted `.hardkas/artifacts/<ts>-<planId>.plan.json` silently. It now prints `Plan saved to: <the path written>` and `Next: hardkas tx sign <path> --account <from>` (only when `--from` is a name); no workspace ⇒ says the plan was not saved. JSON output unchanged. Test `demo-ready-e21-plan-path.test.ts` 1/2 → 2/2 (the printed path exists, holds the plan and `tx sign` accepts it).

**E26 — simulated balance.** The runner echoed its input (`Account: Unknown`, `Address: alice`) although the balance was right. `@hardkas/localnet` now exports `resolveMatchAddress` (the resolution `getSpendableUtxos` already used); the runner reports the state account and that address. Test `demo-ready-e26-simulated-balance-identity.test.ts` 0/2 → 2/2 (name and `kaspa:sim_alice` both → alice + its simulator address); E04 CLI + SDK tests 7/7.

**E10 — npm README.** `packages/cli/README.md` rewritten: release scope, Install, Quickstart, First transaction (simulator, then local node), Evidence, Reference. Removed the Chaos Engine and Secret Redaction sections (not Golden Core; their claims were not re-verified here). Facts checked: npm dist-tags `latest 0.1.0 / rc 0.12.0-rc.23`; the unscoped `hardkas` package does not exist on npm (so the README installs `@hardkas/cli` before any `npx hardkas`); root `engines.node >=22.5.0`; `tx sign` has no password option (the local-node example uses plaintext dev keys, labelled as such). Also corrected my own first-contact sentence in `docs/start/quickstart.md` (init sets `"type": "module"` only when it creates package.json).

**AUD-21.** Regression kept (3 cases) plus a human-output case: 4/4.

## 6. Repo checks

- Lint (`turbo lint --continue`): only the 5 pre-existing errors (sdk `igra.ts` 31:9, sdk `pskt/adapters/test-fake.ts` 26:9, cli `torture-runner.ts` 458/493, cli template `wallet-backend/.../WalletService.test.ts` parse error); none in files touched here.
- Typecheck 55/55.
- `docs:check-cli` up to date; `check:docs` no drift.
- `version:check`: FAILED at first **because of this block** — its comments/tests said "rc.24"/"rc24", and AUD-37 refuses references to a pre-release newer than the root version (the version number is the owner's call). Relabelled everything to version-neutral "demo-ready" and renamed the new tests `demo-ready-*.test.ts` → PASS.
- Pre-existing failures, unrelated to this block: `docs:check-claims` (the committed claims doc says hash version 4; the code is 5), `docs:check` (CONTRIBUTING.md links a missing SECURITY.md), `api:check` (EXPERIMENTAL_SURFACE.md, DEPRECATED_SURFACE.md, MIGRATION_GUIDE_0_9_TO_0_10.md, API_FREEZE_0_10.md missing). Generated claims docs were regenerated only to read the drift and restored.
- Mistake of mine: the relabel/rename ran while the first full gate (`rc24-full1`) was in flight; that run is not used as evidence. The gate is re-run after the rename.
## 7. Found during qualification prep (not fixed — outside the five listed polish items)

- **GEN-CONFIRM** — `accounts real generate --name zed --unsafe-plaintext` without `--yes`, stdin closed (no TTY): prints the `(y/N)` prompt and exits **0** with nothing generated or written (`rc24/d2-check.cjs`: exit=0, accountsStored=0). The unanswered prompt leaves the event loop empty, so the process just ends; to automation it reads as success. Same class as AUX-11 (fixed for `tx send` only). Proposed fix (~10 lines): without `--yes`, refuse when stdin is not a TTY or the prompt is declined, with a coded NOT EXECUTED error and exit 3, as `declineUnconfirmedSend` does.
- No Node image is present in the local Docker, so a Linux-container run of the journeys would need a download; not done. Qualification isolation = host directory outside the repo + candidate tarballs only (see §8).

## Defect matrix (deliverable §2)

| ID | Before | Root cause | Fix | Regression | After |
|---|---|---|---|---|---|
| AUD-01 | `pnpm install --frozen-lockfile` → ERR_PNPM_OUTDATED_LOCKFILE; published rc.23 manifest declares `@hardkas/pskt-native-win32-x64-msvc` (404 on npm) | `prepublishOnly: napi prepublish -t npm --skip-optional-publish` re-adds the platform optionalDependency on every directory publish and never publishes that package; pack never runs it | hook removed, generated block removed (loader never uses the platform package; the main package ships `*.node`) | `packages/testing/test/demo-ready-aud01-packaging.test.ts` (2/4 → 4/4) | frozen lockfile OK; packaging gate §8 |
| E02 | real node, continuous mining: `tx plan` 3/3 `UTXO_VIRTUAL_STATE_UNSTABLE` | plan discarded whenever the virtual fingerprint changed between the reads that bracket planning | validity is UTXO-scoped: end-of-attempt re-read of UTXOs + sender mempool; retry; `SELECTED_UTXO_INVALIDATED`; fingerprints recorded as `metadata.planningWindow` | `packages/cli/test/demo-ready-e02-live-dag-planning.test.ts` (0/6 → 6/6: A, control, B×2, C×2) + re-baselined wave2-b T-A17a | real node: plan 3/3 OK while the DAA moves; full lifecycle CONFIRMED |
| LOCALNET-MINER (found by E02 test D) | `--keep-miner`: coinbase outpoints of the mining address vanish/reappear; a plan sent ~30 s later refused as orphan | companion cpuminer ran unthrottled (the repo's harnesses already throttle it) | `toccataMinerArgs()` adds `--throttle 5` (env override) | `packages/cli/test/demo-ready-localnet-miner-throttle.test.ts` (0/2 → 2/2) | 0 outpoints leave the set during mining; delayed send accepted |
| E20 | `--name ana` → `ana1`; encrypted duplicate overwrote the existing keystore | `{count: parseInt(..), ...options}` let the string "1" win; keystore written before the duplicate check | spread order; names computed once; `ACCOUNT_NAME_TAKEN` (exit 2) before any prompt/write | `packages/cli/test/demo-ready-e20-account-names.test.ts` (1/4 → 4/4) | `ana`; `--count 2` → ben1, ben2; duplicates refused, keystore byte-identical |
| E21 | plan persisted silently without `--out` | no output for the lattice copy | prints `Plan saved to: <written path>` + next step | `packages/cli/test/demo-ready-e21-plan-path.test.ts` (1/2 → 2/2) | printed path exists and `tx sign` accepts it |
| E26 | `Account: Unknown`, `Address: alice` | display echoed the input | report the simulator account + the address the query read (`resolveMatchAddress` exported) | `packages/cli/test/demo-ready-e26-simulated-balance-identity.test.ts` (0/2 → 2/2) | `Account: alice`, `Address: kaspasim:…` |
| E27 | `Created: test/payment.scenario.ts` | hard-coded string | prints the path written | `packages/cli/test/demo-ready-e27-init-messages.test.ts` (0/1 → 1/1) | every `Created:` path exists |
| E10 | npm README opened with the Chaos Engine, no install/quickstart | — | README rewritten: scope, Install, Quickstart, First transaction, local node, Evidence | README commands executed verbatim in qualification §9 | see §9 |
| AUD-21 | (fixed in Step 2) | — | preserved | `demo-cut-aud21-no-secrets-in-json.test.ts` 4/4 (+ human output case) | key absent from stdout/stderr |

## Tests (deliverable §4)

- Targeted (new/re-baselined): AUD-01 4/4 · E02 6/6 · miner 2/2 · E20 4/4 · E21 2/2 · E26 2/2 · E27 1/1 · AUD-21 4/4 · wave2-b re-baselined 4/4 (in the affected set).
- Affected packages: plan runner set (wave2-b, wave2-c, execution-guard-runners, simulated-isolation, localnet-fund-race) 21 passed / 2 skipped; init set (newcomer, scaffold-versions, E27) 15/15; balances (E26, E04 CLI + SDK) 9/9; AUD-21 + first-contact small fixes 9/9 (before relabel) and 4/4 after.
- Full gate `rc24-full2` (after the relabel): **883 files · 1981 tests · 1953 passed · 0 failed · 28 skipped · PASS (699 s)**, 0 non-loopback attempts. (`rc24-full1` = 1946/0/28 plus 4 "file does not exist" errors for files I renamed mid-run; not used.)
- After two comment/doc-only touch-ups (merged doc comment in `localnet/src/balance.ts`; README verify wording): E26 + E04 9/9, `docs:check-cli` OK, `check:docs` OK, `version:check` OK.
- Typecheck 55/55. Lint: only the 5 pre-existing errors.

## 8. Packaging (deliverable §5) — `rc24/pack1/`

- `pnpm build` exit 0. It rewrote 33 tracked files (32 `labs/showcase-suite/**` JS + `packages/pskt-native/hardkas-pskt-native.win32-x64-msvc.node`); they were restored to HEAD before the first snapshot, so the tarballs carry the committed native binary.
- Snapshot → `pnpm pack` of the 25-package consumer closure (`@hardkas/cli` + scaffold's `@hardkas/sdk`/`@hardkas/testing`, all 0.12.0-rc.23) → publish dry-runs → snapshot: **3436 files, 0 added / 0 removed / 0 changed (byte-identical)**.
- Dry-runs: `npm publish --dry-run` (pskt-native) exit 0 — 4 files, no manifest change; `pnpm publish --dry-run --no-git-checks` (pskt-native) exit 0; `pnpm publish --dry-run --no-git-checks` (cli) exit 1 = "You must specify a tag using --tag when publishing a prerelease version" (npm 11 guard; changesets passes `--tag`); re-run with `--tag rc` → exit 0, 124 files, tag rc, tree again byte-identical.
- Tarball inspection: 25 tarballs, **0 problems** (no `workspace:`/`link:`/`file:` specs; every `@hardkas/*` dependency is a candidate at the same version; no shipped `.hardkas/` or secret-looking files; cli ships `dist/index.js` + README whose first section is `## Install`, no stale `out/`); `@hardkas/pskt-native`: no optionalDependencies, no prepublishOnly, ships `hardkas-pskt-native.win32-x64-msvc.node`; `@hardkas/sdk` keeps `optionalDependencies: {"@hardkas/pskt-native": "0.12.0-rc.23"}` (a candidate).
- SHA-256 (first 16 hex) of each candidate: `rc24/pack1/tarball-sha256.txt` (e.g. cli 65BA07F96CB55DC7, pskt-native 70389E8BA0615197, sdk F92DD3BD0411A966).
- Note: for pskt-native `npm publish --dry-run` without `--tag` reports "tag latest" despite `publishConfig.tag: "alpha"` — release tagging must stay explicit (`--tag`).

## 9. Demo qualification (deliverable §6) — `C:\Users\jrodr\AppData\Local\Temp\hk-dr-q3\` (`qual.log`, `qual-results.json`)

Environment: Windows 11, Node 24.15.0, npm 11.12.1, pnpm 11.1.3 (global, outside the repo), Docker Desktop 29.4.2. Projects live outside the repository; `@hardkas/*` can only come from the 25 candidate tarballs (npm `overrides` / pnpm `overrides` in `pnpm-workspace.yaml`, plus the @hardkas scope pointed at a dead registry so any fallback to the published rc.23 fails loudly — it did, visibly, in the first harness attempt). No `HARDKAS_TEST_*` knob. The README's `npx @hardkas/cli@rc init .` is run as the CLI installed from the tarballs; `npm install --save-dev @hardkas/cli@rc` as the CLI tarball. Not a context-free agent and not a VM/container (no Node image locally): the context-free DAT stays the next step of the frozen path.

| Journey | Steps | Result | Evidence |
|---|---|---|---|
| install | 6 | PASS | npm clean install (218 pkgs) — lock: all 25 @hardkas from tarballs; `npx hardkas --version` 0.12.0-rc.23; pnpm install; **pnpm install --frozen-lockfile from scratch**; `pnpm exec hardkas --version` |
| A · simulator (npm) | 14 | PASS | init announces only files it created (incl. `test/payment.test.ts`); `npm test` 1 passed; `Account: alice` + `kaspasim:` address; bob 1010 → 1035 → 1045; `tx plan` without `--out` prints an existing path; plan/sign/send; `verify` FULL; `why <receipt>` |
| A · simulator (pnpm) | 5 | PASS | init; `pnpm add -D` (pnpm 11 needs the esbuild build approved: `allowBuilds.esbuild: true`, what `pnpm approve-builds` records); `pnpm test`; bob +25 |
| B · local node, continuous mining (npm) | 16 | PASS | `localnet start --toccata`; accounts `miner`, `ana` (exact names); `localnet fund miner --keep-miner`; `tx plan` attempts=1 while DAA 1375→1401; sign; send SUBMITTED; `tx status` CONFIRMED (110 ≥ 100); `tx wait --until confirmed` CONFIRMED (293); `verify` FULL; `why`; `explain` (Network State, no consensus claim); `localnet stop` |
| C · tamper | 4 | PASS | simulator: `verify` exit 1 `ARTIFACT_HASH_MISMATCH`; `send` exit 1 "Invalid SignedTx artifact: Hash mismatch", no artifact written, state unchanged. localnet: `verify` exit 1; `send` exit 1, no submission written (never reached the node) |
| D · confirmation guard | 1 | PASS | `tx send --from alice --to bob --amount 1 --network testnet-10` (no `--yes`): exit 3 NOT EXECUTED; `.hardkas/` byte-identical |

Harness corrections between runs (mine, not product defects; q1/q2 logs kept): lock check matched nested deps of @hardkas/dev-server; pnpm 11 ignores `package.json` "pnpm.overrides" (moved to pnpm-workspace.yaml); npm needs `$name` overrides for direct deps; the generated `npm test` pays alice→bob 10 KAS in the project's simulator, so balances are compared relative, not to 1000. After the qualification the repository tree is byte-identical to the post-packaging snapshot; no container left running.

Observations (not failures): `npm test` changes the project's simulator balances (alice 989.995928, bob 1010 afterwards); pnpm 11 consumers must approve esbuild's build script; errors redact hash-like hex (`[REDACTED]`) in messages.

## 10. Remaining (deliverable §7)

BLOCKS DEMO — none found on the Golden Core journeys. Prerequisites before a publish: (1) commit this block: HEAD `ad1fa86ca` itself carries the AUD-01 manifest; (2) the qualified tarballs are 0.12.0-rc.23 (no bump by me) and cannot be published as such — after the owner picks the version, rebuild and re-run `pack-gate.ps1` + `qual.cjs` on exactly the tarballs to publish, and publish those files with an explicit `--tag`.

BLOCKS TN10/MAINNET — E02 proven on a local node only (needs a public TN10 run: P-03 funds, P-04 remote node identity); the CLI now re-validates selected inputs, the SDK path does not (it never had the fingerprint guard either); the miner throttle and index-lag observations are localnet-only; `pskt-native` ships only a win32 binary (Golden Core unaffected: lazy import); mainnet signing guards not exercised here.

EXPERIMENTAL / LATER — E35 (generate without `--yes` exits 0, registered, not fixed); E27 remainder (`cd .` hint); E36 residual (UTXO index trails CONFIRMED by seconds at ~100 DAA/s; `HARDKAS_TOCCATA_MINER_THROTTLE_MS=50` ≈ Kaspa's pace but ~115 s funding); R-iii (a rejected submission keeps txId "unknown": `tx status <signed txId>` then says INSUFFICIENT_EVIDENCE / network simulated); pnpm 11 esbuild approval not in the README; pre-existing repo checks failing (`docs:check-claims` hash version 4 vs 5, `docs:check` SECURITY.md link, `api:check` missing surface docs); the other open errors (E08, E09, E11–E19, E28–E34) are outside the Golden Core.

## 11. Recommendation

**RC24_DEMO_READY** — on the Golden Core, simulator + controlled localnet, from the candidate tarballs; with the two publish prerequisites of §10 and the context-free DAT still ahead. No STOP condition was hit: Generator upstream kept, signed↔plan binding and verification untouched (tampering rejected before the network), pending-spend evidence kept and re-checked, no dependency on a non-existent package, packaging left the tree byte-identical, tarballs behaved as the monorepo.

## Files changed (deliverable §3) — 26 paths on top of `ad1fa86ca`, nothing committed

Source
- `packages/pskt-native/package.json` — AUD-01: `prepublishOnly` (napi prepublish) and the optionalDependency it generated removed.
- `packages/core/src/utxo-errors.ts` — E02: `SelectedUtxoInvalidatedError` / `SELECTED_UTXO_INVALIDATED`.
- `packages/core/src/runtime-context.ts` — E02: `planningWindow` evidence type.
- `packages/artifacts/src/tx-plan.ts` — E02: `planningWindow` projected into plan metadata.
- `packages/cli/src/runners/tx-plan-runner.ts` — E02: UTXO-scoped validity, end-of-attempt re-read of UTXOs + sender mempool, new error, evidence.
- `packages/cli/src/runners/localnet-runners.ts` — E36: `toccataMinerArgs()`, miner `--throttle 5`.
- `packages/cli/src/commands/accounts.ts` — E20: options spread order.
- `packages/cli/src/runners/accounts-real-generate-runner.ts` — E20/E37: names computed once; `ACCOUNT_NAME_TAKEN` before any prompt or write.
- `packages/cli/src/commands/tx.ts` — E21: `Plan saved to:` + next step.
- `packages/cli/src/runners/accounts-balance-runner.ts` — E26: report the identity the query used.
- `packages/localnet/src/balance.ts` — E26: `resolveMatchAddress` exported.
- `packages/cli/src/commands/init.ts` — E27: announce the path written.

Docs
- `packages/cli/README.md` — E10 rewrite (scope, Install, Quickstart, First transaction, local node, Evidence).
- `docs/start/quickstart.md` — corrects my first-contact ESM sentence.
- `apps/docs/docs/concepts/transactions/utxos.md`, `error-model.md` — E02 property and the new error.
- `PUBLIC_API_SURFACE.md` — lists `SelectedUtxoInvalidatedError`.

Tests
- New: `packages/testing/test/demo-ready-aud01-packaging.test.ts`; `packages/cli/test/demo-ready-e02-live-dag-planning.test.ts`, `demo-ready-localnet-miner-throttle.test.ts`, `demo-ready-e20-account-names.test.ts`, `demo-ready-e21-plan-path.test.ts`, `demo-ready-e26-simulated-balance-identity.test.ts`, `demo-ready-e27-init-messages.test.ts`.
- Re-baselined: `packages/cli/test/wave2-b-planner-convergence.test.ts` (T-A17a asserted `UtxoVirtualStateUnstable` for a moving DAG — the E02 defect itself; its layer-2 case passed vacuously).
- Extended: `packages/cli/test/demo-cut-aud21-no-secrets-in-json.test.ts` (+ human output case).

Not touched: versions, changesets, commits, pushes, publication. Evidence and harnesses: scratchpad `rc24/` (logs, `pack-gate.ps1`, `qual.cjs`, `utxo-churn*`, tree snapshots) and `%TEMP%\hk-dr-q3`.

---

# GO — FINISH DEMO-READY BLOCK (2026-09-28, afternoon)

## 12. Post-confirmation UTXO view (the Golden Path blocker of this block)

Defect (E36 residual, now closed): with blocks arriving, the node's UTXO index trails acceptance, so a balance read right after CONFIRMED could be 0 (`e02-after2.log`: ana 0 KAS; settled node 15 KAS).
Fix: `tx wait --until accepted|confirmed`, once the derived state reaches the target, keeps waiting — inside the same `--timeout`, at least one look, polling at `--interval`, no fixed sleep — until the same node's UTXO view reflects the transaction: an output of it listed for every address the plan pays (recipients + change) and none of the inputs it spent still listed for the sender. The plan comes from the recorded submission (`fee.planArtifactId`, else `lineage.rootArtifactId`) through the verified store. Not converged by the deadline ⇒ `TX_WAIT_UTXO_VIEW_STALE` (exit 1) saying the tx is CONFIRMED according to the recorded observations, what is missing, and that balances read now would be stale. No verifiable plan ⇒ view "not checked" with the reason (no failure). The derived Q4 state is untouched: the view is reported as a separate "UTXO View" row / `utxoView` JSON field, never as a state; FINALIZED is never claimed by it. Files: `packages/cli/src/runners/tx-wait-runner.ts`, `packages/cli/src/commands/tx.ts` (row, JSON field, command description → `docs/reference/cli.md` + `cli.generated.json` regenerated), README local-node flow adds `accounts balance ana --network simnet` after `tx wait` plus one sentence on the view wait.
Tests: `packages/cli/test/demo-cut-t-a14b-tx-status.test.ts` — the scripted node now answers `getUtxosByAddress` (default: already indexed, so the 7 existing cases keep their meaning) + 3 new cases: trailing view waited out (looks 3), never-converging view → `TX_WAIT_UTXO_VIEW_STALE` bounded by the timeout (fake clock ≥ 3000 ms) with no forbidden claim and no FINALIZED, no plan in the workspace → not checked. Before the fix: 3 new failed / 7 passed; after: 10/10 (+6 no-false-claims).
Real node (`rc24/view-live1.log`, continuous mining): `tx status` CONFIRMED (108) on the first look, `tx wait` Reached CONFIRMED (298) with "UTXO View reflects this transaction … (4 look(s))" — the view trailed for 3 looks — and `accounts balance ana` right after: **10 KAS, 1 UTXO** (was 0 before this fix).

## 13. First failures kept next to their reruns (classified)

| Gate / step | First result | Cause | Rerun |
|---|---|---|---|
| full hermetic gate `rc24-full1` | 4 file-level "Failed to load url … Does the file exist?" (1946/0 otherwise) | mine: test files renamed while the run was in flight | `rc24-full2` PASS 1953/0/28 |
| `version:check` | FAIL (10 hits) | mine: "rc.24"/"rc24" labels in comments/tests (AUD-37) | PASS after relabel to "demo-ready" |
| `pnpm publish --dry-run` (cli) | exit 1 | harness invocation: npm 11 refuses a prerelease publish without `--tag` | `--tag rc` exit 0, tree byte-identical |
| qualification q1 | harness crash | harness: lock regex caught nested deps; pnpm 11 ignores package.json overrides; npm EOVERRIDE for direct deps | q2 |
| qualification q2 | A: 3 balance checks, A-pnpm: `pnpm add` exit 1 | harness: generated `npm test` moves 10 KAS (absolute expectations wrong); pnpm 11 `ERR_PNPM_IGNORED_BUILDS` (esbuild approval) — an environment step a pnpm 11 user also meets | q3 PASS 46/46 |
| E02 unit tests after the fix | 5/6 | my test assumed which UTXO the Generator selects | 6/6 |
| E20 tests after the fix | 3/4 | my test parsed JSON out of stdout+stderr | 4/4 |
| tx wait "no plan" case | 15/16 | test setup: the SDK instance memoised the plan it wrote, deleting the file was not enough | 16/16 (the submission now names an absent plan) |
| canonical gate `dr-full3` (after the view barrier) | 1955 passed / **1 failed** / 28 skipped: `packages/sdk/test/wave1-def1c-canonical-identity.test.ts` "SDK-returned receipt.contentHash equals…" — Test timed out in 5000 ms | load-induced timeout flake (known: TEST-INFRA-1, "flake sin causa (wave1-def1c)"): the file took 9621 ms here vs 2179 ms in `rc24-full2`; SDK receipt-identity code is not touched by this GO (CLI-only changes); isolated reruns 3/3 PASS (8/8; 3360 / 2421 / 2305 ms) | `dr-full4` (see below) |

## 14. Gates of this GO (in order)

- Targeted regressions (`dr-targeted`): all demo-ready tests + tx status/wait + no-false-claims + AUD-21 + E04 (CLI, SDK) + wave2-b/c/e + newcomer + scaffold-versions + localnet-fund-race: **79 passed / 0 failed / 1 skipped (live)**.
- Typecheck (`dr-typecheck`): **55/55**.
- `version:check`: **PASS**.
- Lint (`turbo lint --continue`, `dr-lint.log`): only the 5 pre-existing errors (sdk `igra.ts`, sdk `test-fake.ts`, cli `torture-runner.ts` ×2, cli template `WalletService.test.ts`); the warnings in touched files (`init.ts`, `tx.ts`, `accounts-balance-runner.ts`, `localnet-runners.ts`, `tx-plan-runner.ts`) are all in pre-existing lines (unused imports/vars); `tx-wait-runner.ts` and the core/artifacts/localnet files touched have none.
- Canonical hermetic gate: `dr-full3` **1955 / 1 failed / 28** (flake, classified above) → `dr-full4` **883 files · 1984 tests · 1956 passed · 0 failed · 28 skipped · PASS (701 s)**.
- `pnpm install --frozen-lockfile` (repo, pnpm 9.15.4): **exit 0**, `pnpm-lock.yaml` byte-identical.
- Packaging `pack2` (new bytes): build exit 0 (33 tracked build outputs restored before the snapshot); 25 × `pnpm pack` exit 0; `npm publish --dry-run` (pskt-native) 0, `pnpm publish --dry-run` (pskt-native) 0, `pnpm publish --dry-run --tag rc` (cli) 0; tree **byte-identical** before/after (3436 files, 0/0/0); inspection **25 tarballs, 0 problems** (pskt-native: no optionalDependencies, no prepublishOnly; cli README starts at `## Install`). Hashes: `rc24/pack2/tarball-sha256.txt`.
  Note: between `pack1` and `pack2` the core and pskt-native tarballs are byte-identical; cli differs (new code); sdk and localnet differ only in the ORDER of dependency keys in `package/package.json` (same names and versions; pnpm's rewrite of `workspace:*` does not fix key order) — their `dist` files are identical (`rc24/tgz-diff.cjs`).
- Acceptance against `pack2` (`%TEMP%\hk-dr-q4`): **49/49 PASS** — install 6 (npm clean; lock 25/25 from tarballs; pnpm install + `--frozen-lockfile` from scratch), A (npm) 15 incl. `npm test` 1 passed, `tx status <synthetic>` SYNTHETIC_EXECUTED and "local simulated execution / Consensus Validated NO", A (pnpm) 5, C 4 (tamper rejected before the network, simulator and localnet), D 1 (testnet-10 without `--yes` → exit 3, `.hardkas` untouched), **B 18**: `tx status` ACCEPTED (21) → `tx wait --until confirmed` Reached CONFIRMED (251) + "UTXO View reflects this transaction … (4 look(s))" → `accounts balance ana` **10 KAS, UTXOs 1** → node read (installed @hardkas/kaspa-rpc) lists exactly one UTXO for ana = `<txId>:0`, 1000000000 sompi → verify FULL → why → explain → stop.
- After the acceptance: repository tree byte-identical to the post-packaging snapshot; HEAD `ad1fa86ca` = `origin/develop`; no container running.

## 15. Deliverable of this GO — see the chat message; evidence in §12–§14. Recommendation: **READY_FOR_OWNER_COMMIT** (commit all 30 paths — `packages/pskt-native/package.json` included, HEAD carries AUD-01; after the version bump, rebuild and re-run `rc24/pack-gate.ps1` + `rc24/qual.cjs` on exactly the tarballs to publish).

## 16. Post-publish verification from the public npm registry (2026-09-28, after the owner's publish)
- Publish: first `pnpm -r publish --tag rc` stopped while publishing `@hardkas/artifacts` (15:39 UTC: 10/25 at rc.24, cli `rc` still rc.23); the owner resumed it; 16:28 UTC: **25/25 at 0.12.0-rc.24**, `rc` of cli/sdk/testing = rc.24, cli published 16:12:21Z, `rc24/registry-check.cjs` problems=0 (pskt-native without optionalDependencies).
- Bump commit `4d0bd6432` vs `ad437dd6f`: 234 files version-only; the rest CHANGELOG, `docs/internal/audit/releases/0.12.0-rc.24/*`, release-validation md, risc0 fixture metadata, the rc23 silverCompile fixture and `packages/cli/out/**` (tracked legacy build output, 380 files, not in the npm `files`).
- Published vs qualified (`rc24/published-vs-qualified.cjs`, `published-deep.cjs`, logs next to them): 23/25 byte-identical apart from the version string; cli 123 files identical once version and bundler chunk hashes are normalised; pskt-native `.node` differs in 29 bytes (COFF + 3 debug-directory timestamps, PDB GUID, one version digit) — a rebuild of the same code.
- Registry qualification `rc24/qual-npm.cjs` (root `%TEMP%\hk-rc24-npm1`, fresh npm cache, README-literal `npx @hardkas/cli@rc init .` + `npm install --save-dev @hardkas/cli@rc`, no overrides): **npm path PASS** — registry 4/4 (incl. returning user with the machine's npm cache: `npx @hardkas/cli@rc --version` = rc.24), install npm 4/4 (lock 25/25 rc.24 from registry.npmjs.org), A 16/16, C 4/4, D 1/1, **B 18/18** (`tx status` ACCEPTED (64) → `tx wait` CONFIRMED + UTXO view → balance ana 10 KAS, UTXOs 1 → node lists ana = `<txId>:0` 1e9 sompi → verify/why/explain → stop).
- **pnpm first results FAIL (kept):** install `pnpm add @hardkas/cli@rc` → cli **0.12.0-rc.23** (lock 25/25 rc.23, `--version` rc.23); A-pnpm `pnpm dlx @hardkas/cli@rc init .` ran rc.23 (scaffold `test/payment.scenario.ts`, pins rc.23), `pnpm add -D` ERR_PNPM_IGNORED_BUILDS (esbuild via vitest), `pnpm test` failed with the rc.23 defect `parent_plan_unresolved`, balance bob 1000→1000 (rc.23 E04). **Cause (verified):** pnpm 11 default `minimum-release-age` = 24*60 min (pnpm dist source) — tag installs skip versions younger than a day and silently take the previous one; probe: exact `@0.12.0-rc.24` installs (pnpm adds 25 `minimumReleaseAgeExclude` entries in loose mode), `@rc` with `--config.minimum-release-age=0` installs rc.24. Self-heals ~2026-09-29 16:12 UTC. Second cause: pnpm 11 build-script policy (known, undocumented).
- **pnpm second run (exact version, `rc24/qual-pnpm-exact.cjs`, root `%TEMP%\hk-rc24-npm2-pnpm-exact`):** 13/14 — only the first `pnpm add -D` fails (ERR_PNPM_IGNORED_BUILDS); after `pnpm approve-builds esbuild` (what pnpm's error says): lock 25/25 rc.24, `--version` rc.24, `pnpm test` 1 passed, shortcut send bob 1010→1035, plan/sign/send/verify, bob 1045.
- New registered (not fixed, docs): **E38** — README/quickstart do not warn pnpm 11 users that `@rc` lags 24 h after each publish (use the exact version) nor that `pnpm approve-builds esbuild` is needed. After the checks: no container running; repo untouched.
## 17. FIRST-CONTACT BLOCKER found at the start of the 2.1.0 block (2026-09-28) — published rc.24 (and earlier rc) fail for every new user
- Correction of record: every "new user / clean folder" qualification in this block (q3, q4, `qual-npm.cjs` post-publish, the rc.23 user-style test) inherited the machine's `~/.hardkas` (HARDKAS_HOME unset), which holds kaspa-wasm 2.0.1 and silverc 1.0.0 installed on 2026-09-14. The project folders were clean; the HardKAS home was not.
- Reproduction with the published rc.24 and an EMPTY `HARDKAS_HOME` (`%TEMP%\hk-fresh-home1`), README steps: `npx @hardkas/cli@rc init .` exit 0 · `npm install --save-dev @hardkas/cli@rc` exit 0 · **`npm test` exit 1** (`WASM_TOOLCHAIN_NOT_INSTALLED: kaspa-wasm 2.0.1 is not installed at …\toolchains\kaspa-wasm\2.0.1. Install it with: hardkas toolchain install kaspa-wasm`) · balance alice 1000 exit 0 · **`tx send … --network simulated --yes` exit 1** (same code, plus the raw `[runTxFlow catch]` trace) · **`accounts real generate --name ana --unsafe-plaintext --yes` exit 1** with a misleading message: `WALLET_BACKEND_UNAVAILABLE: Kaspa cryptography adapter missing … Use 'hardkas accounts real import' to add a test fixture manually for now.`
- Second run, kept next to the first: `npx hardkas toolchain install kaspa-wasm` exit 0 (official zip, verified) → `npm test` 1 passed · shortcut send OK · bob 1035 · generate `Name: ana`.
- Classification: README/quickstart omit `hardkas toolchain install kaspa-wasm` (docs) + nothing installs it automatically (UX/design) + the generate path reports the missing toolchain as `WALLET_BACKEND_UNAVAILABLE` (bug). Registered as **E39**. It also makes the 2.1.0 pin bump break every existing user until they reinstall.

## 18. rusty-kaspa v2.1.0 upstream evidence (collected, nothing changed in the repo)
- Release v2.1.0 published 2026-09-22T13:55:36Z. Docker `kaspanet/rusty-kaspad:v2.1.0` → `sha256:f85da74b9514584451f83a2cbea3aa93f700248302fe7e3e0ab17288f93c905b` (created 2026-09-22T14:33:41Z, same entrypoint and cmd as v2.0.1), `kaspad --version` = `kaspad 2.1.0`.
- `kaspa-wasm32-sdk-v2.1.0.zip`: 56,646,535 bytes, sha256 `ba674e109ff5dd8bedc4dc2ee8a5ecdf4b600b1178a541d77888ec58310b6124` = GitHub asset digest. `nodejs/kaspa/`: kaspa.js 560116 `6d92cb305d0cc2eb26de9e305b7f7a8c17daa130ad478f0b340b50490557dbcf` · kaspa_bg.wasm 11463668 `c9657568610ae1d305bc2e1cf85208ceba0d1a7893c4057b38caa8add2ffb0f5` · kaspa.d.ts 229011 `0034215eb938b5649baddeda2670889ca461ab3644d01943331151bc4dc0d3dc` · package.json 372 `8b61fefaba842c41b805291d95b2f9e81778ec590813a6c34eddcd316659b8d0` (version 2.1.0) · LICENSE 749 `fb06b99a…` (unchanged). New in the folder, not pinned today: `.gitignore`, `kaspa_bg.wasm.d.ts`, `README.md`.
- Pins that the bump touches: `core/src/node-images.ts` (version + digest), `core/src/toolchains.ts` (KASPA_WASM_REFERENCE), `tx-builder/src/kaspa-wallet-adapter.ts:276` (hardcoded "2.0.1"), `core/src/kaspa-params.ts` refs, `kaspa-rpc/src/manifest/snapshot*` (tag v2.0.1), Silver corpus evidence (`fixtures/toccata-v2/silver/*/evidence.json` must match the node digest/version — `core/src/silverscript-corpus.ts:270-273`, so the corpus must be re-recorded on 2.1.0), tests that assert the old digests. pskt-native (rev 78257f2 = 2.0.1) left out on purpose (PoC PSKT upstream pending).
## 19. Block "E39 + rusty-kaspa 2.0.1 → 2.1.0" (GO from the reviewer via the owner, 2026-09-28) — done, STOP
- Scope held: E39 bootstrap + node/WASM pins + docs + qualification. Not touched: RPC transport, PSKT, ZK, Surface Cut, other duplications.
- Baseline: owner's uncommitted rc.25 bump (239 paths) snapshotted (`v210/baseline-*`). DURING the block the owner committed `371c82230 [KLD]: 0.12.0-rc.25 version` (21:40): their 239 + 23 of my files in their final form (+2 of mine at an intermediate state). Still uncommitted (20): corpus fixtures (15), TOCCATA_GAUNTLET_RESULT.json, docs/reference/cli.{md,generated.json}, docs/status/release-claims.md, test-gauntlet/real-node/silver-e2e.mjs (receipt fix), tx-builder/test/mass.test.ts (2nd pin assertion). HEAD alone is inconsistent (2.1.0 pins + 2.0.1 corpus evidence; mass test red); HEAD + the 20 is the qualified state.
- E39 code: `cli/src/toolchain-install.ts` (ensureManagedToolchain, shared by `toolchain install` and `init`; network errors → TOOLCHAIN_DOWNLOAD_FAILED); `init` installs+verifies the pinned kaspa-wasm (reuses a verified install of the same pin; fails with the underlying code + "Retry with: hardkas toolchain install kaspa-wasm"; `--skip-toolchain`, `--toolchain-from-file <asset>`; JSON `result.toolchain`); structured init errors rethrown to the top-level handler; `accounts/src/kaspa-sdk-keygen.ts` passes WASM_TOOLCHAIN_NOT_INSTALLED / _INTEGRITY_FAILED through (other failures: WALLET_BACKEND_UNAVAILABLE with cause + `hardkas toolchain status`). Docs: cli README + docs/start/quickstart.md say what init installs; stale "latest → 0.1.0" sentence removed.
- Pins: node `kaspanet/rusty-kaspad:v2.1.0@sha256:f85da74b…905b` (`kaspad 2.1.0`); kaspa-wasm 2.1.0 asset `ba674e10…6124` (= GitHub digest) + 5 file digests; adapterAuthority reads the pin; consensus params re-checked at v2.1.0 source (unchanged) → provenance refs + v2.1.0; comments no longer claim 2.0.1; corpus COVENANT_SCOPE + mass note derive from the pins. Left on purpose: pskt-native rev (PSKT PoC pending), kaspa-rpc RPC snapshot v2.0.1 (RPC out of scope), generated typedoc under apps/docs (owner's docs workflow).
- Tests: new e39-toolchain-bootstrap (9), e39-kaspa-wasm-pin-wins (1), e39-keygen-toolchain-error (3); pin literals updated in tx-builder mass/adapter tests. First targeted run 90/1 (mass.test.ts 2nd assertion still /2\.0\.1/) → fixed → 8/8.
- Gates: build 47/47; typecheck 55/55; version:check PASS (rc.25); lint errors = the 5 pre-existing (sdk 2, cli 3), no new warnings; docs:check-cli FAIL → regenerated → PASS; docs:check-claims and docs:check FAIL exactly as in the rc24 block (pre-existing). Full hermetic gate `v210-full1` 1969 passed / 0 failed / 28 skipped (+13 new), 0 non-loopback attempts. `test:silverc` 46/46. `test:simnet` 13 passed / 6 skipped (1 fixture file by design; mempool-client 5 skips: its JsonWrpcTransport POSTs HTTP to the wRPC port, which rusty-kaspad serves only over WebSocket → skips on any version; RPC-area debt).
- Corpus re-record on 2.1.0 (first results kept): corpus1 4/4 FAIL (fixture address unfunded on the fresh chain — harness precondition) → funded via `localnet fund fixture` → corpus2: escrow PASS, covenant PASS, v1 + v1b FAIL "no receipt for deploy" (harness looked for a receipt schema; since ad1fa86ca a real send writes hardkas.txSubmission.v1) → fixed silver-e2e.mjs deployToP2sh → corpus3 v1 PASS, v1b PASS. `corpus verify` ok: 4 cases, 5 recompiles, 9 controls, 4 capabilities PASS, node v2.1.0 f85da74b, 0 issues.
- Gauntlet: gauntlet1 FAIL (my operator error: I started the node from test-gauntlet/real-node, whose `.hardkas` run-real-node.mjs wipes → the node's RocksDB files vanished → panic "IO error: No such file or directory …000019.log"). Restarted the node from `%TEMP%\hk-v210-node-ws`, funded fixture → gauntlet2 16/16 PASS, HARDKAS_TOCCATA_BASELINE_READY, report names the 2.1.0 digest.
- Packaging `v210/pack1`: build 0, 25 tarballs, tree byte-identical, inspection 0 problems (no publish dry-runs this time); core carries f85da74b + ba674e10, no db36449e; cli carries the bootstrap and the new README.
- Acceptance `qual-v210.cjs` (root `%TEMP%\hk-v210-q1`, EMPTY project + EMPTY HARDKAS_HOME per journey; init downloads kaspa-wasm 2.1.0 from GitHub each time): **61/61 PASS** — install 6, A 15, C 4, D 1, A-pnpm 5, B 19 (tx status CONFIRMED (108) → tx wait CONFIRMED + UTXO view → ana 10 KAS / 1 UTXO → node lists `<txId>:0` 1e9 sompi, `serverVersion 2.1.0`, plan authority `kaspa-wasm@2.1.0`), E 11 (home with only 2.0.1: existing project `npm test` fails naming kaspa-wasm 2.1.0 and its dir, never loads 2.0.1 → `init` installs 2.1.0 beside it → npm test passes → status 2.1.0 verified → 2.0.1 dir untouched, 6 files identical).
- pskt-native `.node`: at baseline the working copy (e04ec7fe…) differed from HEAD without git noticing (same size, racy stat); my restores left it = HEAD blob 67b4be45 (HEAD = index = worktree).
- Closing condition (reviewer): machine with Node/npm + Docker, no ~/.hardkas → install → Golden Path without knowing kaspa-wasm: MET in tarball mode (A and B journeys). Recommendation: READY_FOR_OWNER_COMMIT of the 20 remaining paths; then republish tarballs from that tree.
## 20. rc.25 published by the owner (2026-09-28 evening) — post-publish verification from npm
- Git: develop `48da4d221` (the 20 pending paths) pushed; main still at the rc.24 merge (PR #82) when checked.
- Registry: 25/25 at 0.12.0-rc.25, `latest` = `rc` = rc.25 (cli/sdk/testing/core), problems 0. Published sha1 ≠ qualified tarball sha1 for 10/25 (the owner re-packed), but `published-vs-qualified.cjs`: 25/25 identical file by file (package.json compared canonically) → same code.
- `qual-npm-v210.cjs` (root `%TEMP%\hk-rc25-npm1`; EMPTY project + EMPTY HARDKAS_HOME + fresh npm cache; README-literal): registry 4/4, install 4/4, A 13/13 (npx init downloaded kaspa-wasm 2.1.0), C 2/2, D 1/1, **B 18/18** (node 2.1.0, serverVersion 2.1.0, plan authority kaspa-wasm@2.1.0, tx status ACCEPTED(99) → tx wait CONFIRMED + UTXO view → ana 10 KAS), **E 10/10** (home with only 2.0.1: fails naming 2.1.0, init installs 2.1.0 beside it, 2.0.1 untouched). E39 closed on npm.
- pnpm first result FAIL (kept): `pnpm dlx @hardkas/cli@rc` → **rc.23** (rc.24 and rc.25 both younger than pnpm 11's 24 h minimum-release-age) → rc.23 scaffold + its old defects (E38). Second run exact `@0.12.0-rc.25` with an empty home (`%TEMP%\hk-rc25-pnpm-exact`): 13/14, only the first `pnpm add -D` stops on ERR_PNPM_IGNORED_BUILDS (esbuild); after `pnpm approve-builds esbuild` all pass; init installed kaspa-wasm 2.1.0.
- Open: E38 (README/quickstart should tell pnpm users about the 24 h lag and esbuild approval). Next agreed step: Surface Cut (needs GO), then the four upstream substitution PoCs.