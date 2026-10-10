# WORKSPACE-AUTHORITY-2 · ledger (2026-10-10)

Isolated worktree `%TEMP%\hk-ra\wt`, detached at develop **`3b0651e7f`** (SECRET-SURFACE-2 published; tree
`d28be569`). The owner's checkout, the demo's localnet and every published evidence folder untouched. No commit, push,
version or configuration migration. The full account of the wave is `INVESTIGATION.md` (§1–§5 the investigation and
the BEFORE; §6 the C-A implementation; §7 the reviewer's qualification hold; §8 the bounded closeout); this ledger is
the index of its decisions, runs and trees.

## 1 · The defect (SDK-EXECUTION-IGNORED, F5 of the mini re-audit)

The workspace declares where it executes through `execution`; the CLI followed it, the SDK read the deprecated
`defaultNetwork` — a mirror the config loader injected from the built-in default ("simulated") into every config that
declared `execution` without the legacy key. One project, two worlds; inside one `tx.plan`, the identities of one
world and the execution of another (INVESTIGATION §1–§4; `before/`: 14 tests, 6 red on the base).

## 2 · Decisions (reviewer, 2026-10-10)

| Round | Decision |
| --- | --- |
| Investigation + BEFORE | accepted (6 red, 8 controls green) |
| C-A, bounded | `execution` canonical; one resolver in `@hardkas/config` for SDK and CLI; `Hardkas.open` honours `execution.default`; `target` (additive) and `network` (a network id, validated) distinguished, a conflict typed; account/world compatibility before the plan through the shared rule; `allowPublic` whole; `defaultNetwork` legacy compatibility only (a derived mirror, in memory); no silent fallback to the simulator |
| Qualification hold | repeat both complete related suites; clarify the counts; verify per-call overrides; confirm SDK/CLI coherence (endpoint included) and the legacy contract |
| Bounded closeout | A `createConsolidationPlan` under the instance's authority (account, destination, UTXOs checked before the plan); B `observe.address({ target })` coherent with the instance's provider, mismatch typed; C the CLI honours the endpoint the resolved network declares (custom URLs included); `networkProfile` stays a papercut; no public API change |

## 3 · Invariants

- **WA2-I1** one workspace, one execution authority: SDK and CLI resolve the same target, network id, mode and
  endpoint from the same bytes (`resolveWorkspaceExecution`; the endpoint through `rpcUrl` and `resolveProvider`'s
  `networkRpcUrl`).
- **WA2-I2** no artifact mixes an identity of one world with the execution of another: `tx.plan` and
  `createConsolidationPlan` check account, destination (and the UTXOs' ownership) against the instance's world before
  any plan exists (`ACCOUNT_NETWORK_MISMATCH`, `UTXO_ACCOUNT_MISMATCH`).
- **WA2-I3** a name that is neither a network nor a target is refused, typed, before anything opens
  (`UNKNOWN_NETWORK`, `EXECUTION_TARGET_NOT_FOUND`); a target/network disagreement is `EXECUTION_NETWORK_MISMATCH`.
- **WA2-I4** an instance is never re-pointed by one call: a per-call `network` (consolidation) or `target`
  (observation) must be the instance's own world (`EXECUTION_NETWORK_MISMATCH`, `OBSERVATION_TARGET_MISMATCH`), and an
  observation is labelled with the world of the provider that produced it.
- Legacy configs (`defaultNetwork` alone) keep their documented resolution; the SDK's explicit `network` override keeps
  its destinations; the public-network guard is reached by the declared target too.

## 4 · Files

Product: `packages/config/src/{resolve,load,provider}.ts`; `packages/sdk/src/{index,accounts,tx,workflow,utxos,capabilities}.ts`,
`packages/sdk/src/observe/{index,backends}.ts`; `packages/cli/src/runners/{tx-plan-runner,tx-sign-runner,tx-send-runner,tx-flow,accounts-balance-runner,accounts-consolidate-runner}.ts`.
Docs: `docs/guides/sdk.md`. Tests: `packages/sdk/test/workspace-authority-2.test.ts` (BEFORE 12 + AFTER 10 + closeout 7),
`packages/cli/test/workspace-authority-2.test.ts` (2 controls + 3 AFTER + 1 closeout); three harnesses adapted to the
contract (`sdk/test/adversarial/wave2-d-send-fee`, `cli/test/wave2-b-planner-convergence`, `cli/test/wave2-c-pending-spend`:
they re-pointed an open SDK by writing `config.defaultNetwork`).

## 5 · Runs (every run kept: `before/logs`, `after/logs`)

| Stage | Run | Result |
| --- | --- | --- |
| BEFORE | `wa2-before-3` | 14 tests: 8 green / 6 red |
| C-A | `wa2-after-2` · `wa2-related-a-2` · `wa2-related-b-2` | 27/27 · 448 (443/0/5) · 367 (359/0/8) |
| closeout BEFORE | `wa2-closeout-before-1` | 35: 27 green / 8 red (the new cases) |
| closeout AFTER | `wa2-closeout-after-1` · `wa2-related-a-3` · `wa2-related-b-3` | 35/35 · 455 (450/0/5) · 367 (357/2/8: a test double without `execution`; the runner reads it tolerantly) |
| final tree | `wa2-closeout-after-2` · `wa2-related-b-4` | 35/35 · 367 (359/0/8) |
| the one full hermetic gate | `wa2-gate-1` | **PASS** — 1198 files, 2901 tests: 2873 green / 0 red / 28 skipped (the base's 2866 / 2838 / 0 / 28 + this wave's 35); 0 non-loopback; 1383 s; `C:\.hardkas` absent before and after; Docker daemon down (no container reachable); the artifacts `.snap` EOL rewrite restored, code tree unchanged (m3 = m2) |

Build / typecheck: `build-wa2-after-1` (24/24, 26/26), `build-wa2-closeout-1` (24/24, 26/26), `build-wa2-closeout-2`
(24/24, 24/24). 0 non-loopback attempts in every run.

## 6 · Registered, not fixed here

`networkProfile` misused as a network in `tx.plan` (typed or untyped planner failures, no cross-world plan); `plan({
amount: "all" })` empty in the simulator (`UPSTREAM_PLANNER_EMPTY`, pre-existing); the CLI's `tx plan` connection
failure is `UNKNOWN` (CLI-CONTRACT-2); `config.network.default` has no reader; `tx.send(signed, url)` with an explicit
URL broadcasts to it without the CLI's execution-compatibility check (a synthetic authorization is refused; a real one
would reach that node — explicit, documented); consolidation plans record no `plannerAuthority`; TEST-VACUOUS-PASS is not
claimed closed by this wave. `PUBLIC_API_SURFACE.md` is the owner's release regeneration (one option and two readonly
members added to the SDK, nothing removed).

## 7 · Trees and manifest

- **Code tree** (this evidence folder excluded): **`43c4b39228f3c5fc42529a091f5dfc9cff03d511`** over HEAD `3b0651e7f`
  (tree `d28be569647916d4501a64c551dba0632ec07345`); 23 paths (21 modified, 2 added), +1153 / −157; code patch
  `workspace-authority-2-code.patch` sha256 `5f9859bcac95bbf24feb525f7b3009db56dec759493c5fd0910a3feaa9239565`.
  Computed with a temporary index (`manifest2.ps1 -Mode code`, kept in `after/scripts`) before the gate (m2) and again
  after it (m3): identical, blob for blob.
- **Full tree** (code + this folder): computed by `manifest2.ps1 -Mode final` once this ledger is frozen — it writes
  `MANIFEST.sha256` (one sha256 per file of this folder, itself excepted) and then the tree the owner's commit must
  reproduce. That hash cannot be written here without changing itself, so it travels with the handover
  (`manifest-final-f1/tree.txt`, the full patch `workspace-authority-2.patch` and its sha256, `MANIFEST.blobs` with one
  git blob id per changed path) and is verified against the published commit, as in every wave.
- Integration as in every wave: `git apply --binary` of the full patch onto the owner's working tree (no `--index`),
  `git add -A`, the owner's commit; the commit's tree must equal the full tree, and the evidence paths must match
  `MANIFEST.blobs` and `MANIFEST.sha256` path by path.
