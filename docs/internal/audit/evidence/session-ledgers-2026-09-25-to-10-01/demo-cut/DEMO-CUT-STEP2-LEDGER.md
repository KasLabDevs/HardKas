# Demo-cut · Step 2 — ledger

Mandate (owner + reviewer, 2026-09-28, "GO Step 2"): exactly three items — **2(f)/T-A14b + `tx status`**, **E04 single simulator identity**, **AUD-21 no secrets in JSON**. Stop conditions: no Q10, E02, AUD-16, PSKT, panel, query/recovery, general CLI cleanup, new observation semantics, Q4 changes, version/publication; the `pskt-native` optionalDependency is not touched. Nothing committed; version unchanged.

Base: HEAD `de6b2da7d` + the uncommitted **first-contact** block (ledger `first-contact/FIRST-CONTACT-LEDGER.md`). Both blocks are uncommitted together; §6 separates their files.

## 1. Reproduction (BEFORE)

| Item | Evidence BEFORE |
|---|---|
| E04 | `dc-e04-before`: 4 of 6 fail — `kaspa:sim_bob` resolved to itself, balances differ per spelling, the SDK balance delta after a send is **−99000000000n instead of +1000000000n** (the exact `init`-test symptom), faucet funds the alias. `dc-cli-before`: `tx send alice→bob 25` then `accounts balance bob` = **1000** (expected 1025); the `init` test fails on the balance check. |
| AUD-21 | `dc-aud21-before2`: the private key stored in `.hardkas/accounts.real.json` appears **verbatim in stdout** of `accounts real generate --unsafe-plaintext --json`. `accounts list --json` did not leak (`describeAccount` omits keys). |
| T-A14b | Sources: `commands/tx.ts` (both send paths) printed `"Consensus Validated": … "YES"` for every network send; `commands/explain.ts` printed `Consensus Validation: performed by remote node` / `Reason: network interaction implies Kaspa consensus`; `runners/tx-wait-runner.ts` printed `Settlement Proof: PASS` / `Status: CONFIRMED` as soon as a txId left the mempool (and without `--address` simply assumed it). `dc-cli-before`: `tx status <txId>` did not exist (path-only), `tx wait --until` did not exist, `explain` of a network submission asserted consensus. Live demo on published rc.23: a rejected resend printed `✔ Transaction broadcast NOT accepted…`, `Tx ID unknown`, `Consensus Validated YES`. |

## 2. Fixes

| ID | Root cause | Fix | Files |
|---|---|---|---|
| E04 | Two derivations of one simulator account: the account layer and plans use `kaspa:sim_<name>`; the simulator state records the address it was seeded with. Reads resolved the alias to the state account; **writes did not** — `applySimulatedPlan` wrote outputs and change under the plan's alias, the faucet under whatever it was given. | `resolveAccountAddressFromState` is now the ONE identity function of the state (name, `kaspa:sim_<name>`, recorded address → recorded address; anything else unchanged). Outputs, change and faucet funds are written through it, exactly as inputs are read. The plan stays in the account namespace (the synthetic signer binding needs `kaspa:sim_alice`). The CLI planner's ad-hoc "change to the state address" reroute is removed (with the state normalising writes it would have injected `kaspasim:` addresses into plans). `accounts balance` is untouched. | `localnet/src/state.ts`, `localnet/src/transactions.ts`, `localnet/src/faucet.ts`, `cli/src/runners/tx-plan-runner.ts` |
| AUD-21 | `generate --json` wrote the raw account records (`privateKey` included in plaintext mode). | The JSON result is `[{ name, address, network, storage: "plaintext" \| "encrypted-keystore", unsafePlaintext, store, keystore?, publicKey? }]` — never the key. Plaintext storage stays the explicit opt-in it was (Q10 not touched). | `cli/src/commands/accounts.ts` |
| T-A14b · `tx status` | No CLI surface of the Q4 model. | `hardkas tx status <txIdOrPath>`: a txId (64-hex or `synthetic-…`) → ONE `sdk.tx.observe` (unless `--no-observe` or synthetic) then `sdk.tx.status` — the same `txObservation.v1` evidence and `deriveTxStatus`; the CLI only formats `DerivedTxStatus` (state + blue-score depth, accepting block, policy with origin, finality "final according to the observed … rule … not a claim of irreversibility", observers, per-observer views on conflict, evidence ids, reasons). A path keeps the signature-coverage view. `--json` returns the full derived object. The observer is the node configured for the network of the recorded submission (or `--network`). | `cli/src/runners/tx-status-runner.ts` (new), `cli/src/commands/tx.ts` |
| T-A14b · `tx wait` | Parallel semantics: "Settlement Proof: PASS / CONFIRMED" after leaving the mempool or by assumption. | Rewritten on the same model: each look is `sdk.tx.observe` (one persisted observation); stops when the derived state reaches `--until accepted` (ACCEPTED/CONFIRMED/FINALIZED) or `--until confirmed` (`isConfirmed`: depth ≥ policy, or FINALIZED); REJECTED_BY_NODE / CONFLICTING_OBSERVATIONS → `TX_WAIT_FAILED` exit 1; timeout → `TX_WAIT_TIMEOUT` exit 1 naming the last derived state; a simulator txId → `outcome: synthetic`, exit 0, "there is no network to wait for". Options: `--until` (default confirmed), `--timeout`, `--interval`, `-n/--network`, `--json`. **Removed: `--url`, `--address`.** | `cli/src/runners/tx-wait-runner.ts`, `cli/src/commands/tx.ts` |
| T-A14b · `tx send` | "Consensus Validated: YES" on every network send; ✔ on rejection; "Tx ID unknown". | Network sends print **`State`** = `sdk.tx.status` right after the submission (SUBMITTED or REJECTED_BY_NODE, with the model's reason), "Execution Scope: network submission", "Replay Status: not supported for network submissions", next step `hardkas tx status <txId>`; title "Transaction submitted to the node" / "Transaction NOT accepted by the node" with **✗**; when the node returns no txId the signed txId is shown as "Tx ID (as signed)". Simulator rows unchanged ("Consensus Validated: NO" is true and pinned by the Wave 1.5 test). | `cli/src/commands/tx.ts`, `cli/src/ui.ts` (`causality` tone) |
| T-A14b · `explain` | "performed by remote node" / "implies Kaspa consensus". | Network artifacts: **`Network State`** — for a submission/observation, the state derived by `sdk.tx.status` (no new observation); for a plan/signed artifact, "not a network fact". Replay row: "not supported for network artifacts". Simulator rows unchanged. | `cli/src/commands/explain.ts` |
| Generated reference | Options of `tx status`/`tx wait` changed. | `docs:generate-cli` re-run (`docs:check-cli` up to date). | `docs/reference/cli.md`, `docs/reference/cli.generated.json` |

## 3. Tests

| File | Cases | What it pins |
|---|---|---|
| `sdk/test/adversarial/demo-cut-e04-simulator-identity.test.ts` | 6 | one address per account for every spelling; alice→bob 25: identical balances per spelling, +25 / −(25+fee), no UTXO under an alias; SDK balance by name = by identity; the change of one send is spent by the next; faucet funds the one identity; a post-fix receipt replays |
| `cli/test/demo-cut-e04-cli-balances.test.ts` | 1 | the demo scenario through the built CLI: bob 1025 (name and `kaspa:sim_bob`), alice 1000 − 25 − fee |
| `cli/test/first-contact-newcomer.test.ts` (modified) | 1 flipped | the `init`-scaffolded test now passes **completely, balance included** (was pinned to the E04 symptom) |
| `cli/test/demo-cut-aud21-no-secrets-in-json.test.ts` | 3 | stored plaintext key absent from stdout **and** stderr of `generate --json`; absent from `accounts list --json`; encrypted account reports its keystore and no 64-hex value |
| `cli/test/demo-cut-t-a14b-tx-status.test.ts` | 7 | scripted node: SUBMITTED → MEMPOOL_ACCEPTED → ACCEPTED(2) → CONFIRMED(100) → FINALIZED (simnet finality depth), each equal to `sdk.tx.status`; REORGED; INSUFFICIENT_EVIDENCE; REJECTED_BY_NODE and `tx wait` failing on it; CONFLICTING per-observer rendering; `tx wait --until confirmed` walk with one persisted observation per look; `--until accepted`; timeout naming the last state; synthetic txId |
| `cli/test/demo-cut-t-a14b-no-false-claims.test.ts` | 6 | **negative search** in the touched sources (comments stripped) for `"Consensus Validated"…"YES"`, `Settlement Proof`, `performed by remote node`, `implies Kaspa consensus`, `assume confirmed`, `broadcast successfully`; built CLI: `tx status --no-observe` SUBMITTED, synthetic status/wait, `--until` usage error (exit 2), path view kept, `explain` on a network submission derives its state |

## 4. Verification

| Run | Result |
|---|---|
| `dc-e04-after` | 6 / 6 |
| `dc-all-after3` (T-A14b suites) | 13 / 13 |
| `dc-all-after` (step-2 + first-contact + Wave 1.5/2(e) CLI suites) | E04 CLI, AUD-21, newcomer (incl. `init`), tasks, small fixes, 1.5, 2(e) green |
| **Full hermetic gate `dc-full1`** | **869 files · 1931 passed · 0 failed · 28 skipped**, PASS, 0 non-loopback attempts (691 s). First-contact gate before this block: 1908/0/28. |
| After the gate: `--until` description text only | CLI rebuilt; `dc-final-cli` 27 / 27 (block suites + `help-integrity`) |
| `pnpm typecheck` | 55/55, 0 errors |
| Lint (`localnet`, `sdk`, `cli`, `artifacts`, `query-store`, `testing`) | only the pre-existing errors in untouched files (`sdk` 2, `cli` 3) |
| `docs:check-cli` | up to date |

### 4.1 Exit gate, real (log `demo-cut/l3b.log`, workspace `demo-cut/ws-l3b`, repo build, empty directory)

Simulator: `init .` → balances alice/bob 1000/1000 → `tx send alice→bob 25` → **alice 974.997964 / bob 1025** → `tx plan … --out p1.json` → `tx sign` → `tx send s1.json --json` (`outcome: submitted`) → `verify s1.json` **FULL** → `why <receipt>` plan→signed→receipt → `tx status <synthetic>` **SYNTHETIC_EXECUTED** ("no new observation: a simulator txId…") → bob 1035.

Real localnet (rusty-kaspad v2.0.1, identity verified): `localnet start --toccata` → accounts `minera1`, `ana1` → `localnet fund minera1` → `tx plan minera1→ana1 100 --out p2.json` (Generator, 3 inputs) → `tx sign` → `tx send s2.json --yes`: **"Transaction submitted to the node" · State: SUBMITTED — submitTransaction returned success at that instant…**, no consensus claim → `tx status` (miner stopped): **MEMPOOL_ACCEPTED** ("present in this observer's mempool at the observation point (local, transient)"), observation persisted → mining burst → `tx status`: **CONFIRMED (254 blue-score confirmations ≥ 100)**, accepting block `2296c04d…`, 2 deciding observations → `tx wait --until confirmed`: reached CONFIRMED (3rd observation) → `tx status --no-observe --json`: `state CONFIRMED`, `confirmations {blue 254, daa 287, unit blue-score}`, `isFinal false` → `verify s2.json` **FULL** → `explain <submission>`: **Network State CONFIRMED … derived from the evidence in this workspace** → `accounts balance ana1` **100 KAS** → `localnet stop`.

AUD-21: `generate --name zeta --unsafe-plaintext --yes --json` → `[{name "zeta1", address, network simnet, storage plaintext, unsafePlaintext true, store, publicKey}]`; the 64-hex key stored on disk is **not present** in the CLI output.

This is the first run of the Q4 observer against a real node: the mempool finding, the virtual-chain acceptance and the blue-score depth all came from rusty-kaspad v2.0.1. ACCEPTED was not seen as an intermediate state live (the burst passed 100 blue score between two looks); the scripted suite covers it.

## 5. Decisions and limitations (for review)

1. **`tx status` extends the existing command** (txId → derived state; path → signature coverage, unchanged) instead of adding a second name.
2. **`tx wait` loses `--url` and `--address`.** The SDK's RPC and observer identity both come from the configured network; answering through an ad-hoc URL would attribute another endpoint's answer to the configured observer (the deferred OBSERVER_ENDPOINT_IDENTITY). `--address` only fed the old assumption logic.
3. **One persisted observation per look** in `tx wait` (same as the SDK's `waitFor*`).
4. **E04 legacy consequences (declared, not migrated):** receipts written by the published rc.23 simulator before this fix recorded outputs under the alias, so `replay verify` of those old receipts now diverges (re-execution writes to the account's one address); simulator states created by rc.23 may still hold alias UTXOs, reachable only by the alias spelling (pre-existing `resolveMatchAddress` direct match). No state migration: rewriting stored addresses would change every older pre-state and break the replay of all older receipts. Recommendation: fresh simulator state for rc.23 workspaces.
5. **Rejected submissions keep their R-iii contract:** `send()` records the txId the node answers, or `"unknown"`; so REJECTED_BY_NODE is not reachable through `tx status <signed txId>` for a real rejection (the send output shows the rejection and the signed txId). Recording the signed txId would create two submissions per txId on a duplicate resend (`RECEIPT_AMBIGUOUS_CONFLICT`) — needs its own decision.
6. **AUD-21 changes the JSON shape** of `generate --json` (records → descriptors); anything that read a key from stdout stops working, by design.
7. **Out of perimeter, observed:** `localnet snapshot` prints "Consensus Validated: YES" only when the user passes `--consensus-validated` (a user-declared flag, not real-node output); `tx-flow` emits an internal `finalized` event only for legacy FULL receipts with status `confirmed` (unreachable for current sends); `apps/docs/.../failure-taxonomy.md` still cites `POLLING_ERROR` for `tx wait` (Ola 10); the dashboard's balance route compares addresses literally (panel); `generate --name ana` stores `ana1` (AUD-15).
8. **Not mine, untouched:** `packages/pskt-native/package.json` and `npm/win32-x64-msvc/package.json` re-add the optionalDependency removed in Wave 0 (AUD-01) — to be restored before the Demo Qualification Gate.

## 6. Files per block (both uncommitted)

**Step 2 (this block):** `packages/localnet/src/{state,transactions,faucet}.ts`, `packages/cli/src/runners/{tx-plan-runner,tx-wait-runner}.ts`, `packages/cli/src/runners/tx-status-runner.ts` (new), `packages/cli/src/commands/{tx,explain}.ts`, `packages/cli/src/ui.ts`, `packages/cli/src/commands/accounts.ts` (the `generate --json` hunk), `docs/reference/cli.md` + `cli.generated.json` (regenerated; they also carry the earlier `tx plan --change` / `tx send --yes` rows already committed in `de6b2da7d`), tests `sdk/test/adversarial/demo-cut-e04-simulator-identity.test.ts`, `cli/test/demo-cut-*.test.ts` (4), and the flipped case in `cli/test/first-contact-newcomer.test.ts`.

**First-contact (previous block):** `docs/start/quickstart.md`, `packages/artifacts/src/{index,schemas,verify}.ts`, `packages/artifacts/src/scenario-result.ts` (new), `packages/cli/src/commands/task.ts`, `packages/cli/src/commands/accounts.ts` (the `(encrypted)`/`(plaintext key)` hunk), `packages/cli/src/runners/accounts-real-generate-runner.ts`, `packages/query-store/src/indexer.ts`, `packages/sdk/src/tx.ts`, `packages/testing/src/scenarios.ts`, re-based `sdk/test/{lifecycle-trust,adversarial/wave1-2-sdk-identity}.test.ts`, fixture `artifacts/test/fixtures/first-contact/`, tests `*first-contact*` (6 files + helpers).

**STOP.** Next per the agreed order: review of the first-contact block + review of this block → owner commit → E02 decision → Demo Qualification Gate (tarballs → empty folder → Simulator CI + Localnet Docker → evidence pack → Supported Core page) → publication → video.
