# Wave 2(b) ledger — AUD-17 (PLANNER-CONVERGENCE-1) + AUD-28 (CHANGEADDR)

Order: REPRODUCE → TEST FAILING → MINIMAL FIX → TARGETED PASS → FULL REGRESSION.
Base: Wave 2(a) tree (uncommitted, `WAVE_2A_SECURITY_REVIEW — PASS`). Version stays `0.12.0-rc.23`. No commits by me.
Mandate (`GO WAVE 2(b)`): converge the CLI real-network planner onto the upstream Generator **without losing the CLI safety layers**, and make `changeAddress` traverse SDK / CLI / toolkit. AUD-19 (pending-spend) explicitly NOT in scope.

## 1. Finding / root cause (pre-2(b) tree)

| Label | Root cause |
|---|---|
| AUD-17 | `packages/cli/src/runners/tx-plan-runner.ts` planned with the legacy `buildPaymentPlan` on BOTH paths (simulator line 184, network line 268) and sealed the artifact without `plannerAuthority` (`createTxPlanArtifact` at 354 passed no authority in `ctx`). The SDK had converged on `TxPlanService.planTransactionUpstream` (`KASPA_WASM_GENERATOR`) / `planTransactionSynthetic` (`SYNTHETIC_SIMULATOR`) since M10-B; the CLI produced a DIFFERENT plan (inputs/fee/mass) for the same intention and left the authority unestablished |
| AUD-28 | `sdk.tx.plan` validated `changeAddress` (line 363) and never forwarded it to either planner; the CLI `tx plan` had no option; the toolkit's `payMany`/`planUpstream` had no parameter, although `PlanTransactionRequest.changeAddress` (Wave 13) was already honoured by both planners |
| Narrative (found while converging) | a planner refusal inside the CLI's network loop fell into the catch-all and was reported as an `RpcConnectionError` (transport), misclassifying e.g. an invalid address as a connection problem |

## 2. Reproduction BEFORE

Structural (quoted from the file as read before the change): both `buildPaymentPlan` calls, no `plannerAuthority` in the artifact ctx, no `changeAddress` in `TxPlanRunnerInput`/CLI option/SDK request/toolkit params. The new suite asserts `plannerAuthority`, CLI≡SDK economics and `change.address`, none of which the previous runner produced.

## 3. Regression tests (written first)

`packages/cli/test/wave2-b-planner-convergence.test.ts` (in-process runner; the node is a scripted `JsonWrpcKaspaClient`; kaspa-wasm from the toolchain baseline):

| Test | Property |
|---|---|
| T-A17c | simulator plan ⇒ `plannerAuthority: SYNTHETIC_SIMULATOR`, `plannerAuthorityDetail`, `metadata.utxoSelection`, `rpcUrl: simulated://local` |
| T-A17a | real-node simnet (`kind: kaspa-node`, explicit `--url`) ⇒ `plannerAuthority: KASPA_WASM_GENERATOR`, detail `sdk@version`, `selectionStrategy: upstream-generator`, fee/mass > 0, change to the sender. **Safety layers intact**: an unstable virtual fingerprint exhausts the bounded retries (`UtxoVirtualStateUnstableError`); inputs that vanish between the read and the confirmation query are never planned |
| T-A17b | the same intention through the CLI runner and `sdk.tx.plan` (real-node config, same scripted UTXO set, same fee rate) ⇒ identical `inputs`, `outputs`, `change`, `estimatedFeeSompi`, `estimatedMass`, `plannerAuthorityDetail` |
| T-A28 | explicit change reaches `plan.change.address` through: CLI real path (`changeAddress`), CLI simulator path (account name resolved), `sdk.tx.plan({ changeAddress })` on simulator and real paths (real path economics ≡ CLI), toolkit `planUpstream` (used by `send`/`payMany`) |

Re-based existing suite: `packages/cli/test/execution-guard-runners.test.ts` — its network fixture used a fake address (`kaspatest:qmockaddress123`) and a fake outpoint (`mocktx`) that the legacy planner accepted; the upstream Generator validates them, so the fixture now derives a checksum-valid testnet address with kaspa-wasm (fixed key) and uses a 64-hex outpoint and a P2PK script. Its property (the execution guard) is unchanged.

## 4. Minimal diff

- `packages/cli/src/runners/tx-plan-runner.ts`: simulator branch → `TxPlanService(...).planTransactionSynthetic(...)`; network branch → `planTransactionUpstream(...)` over a provider that serves exactly the read snapshot (`spendableUtxos`, `vBefore.virtualDaaScore`) inside the SAME retry loop (fingerprint before/after, confirmation query, `UtxoVirtualStateUnstableError`, RPC error classification all unchanged); `changeAddress` input resolved like `to` (`resolveHardkasAccount` + `assertAccountCompatible`, `CHANGE_ADDRESS_UNRESOLVED`); artifact `ctx` carries `utxoSelection`, `plannerAuthority`, `plannerAuthorityDetail` (never synthesised); `UpstreamPlannerError` keeps planner refusals out of the RPC-connection classification; legacy imports (`buildPaymentPlan`, `createMockUtxo`, `resolveHardkasAccountAddress`) removed.
- `packages/cli/src/commands/tx.ts`: `tx plan --change <accountOrAddress>`.
- `packages/sdk/src/tx.ts`: `plan({ changeAddress })` typed, validated (as before) and forwarded to both planners.
- `packages/toolkit/src/wallet.ts`: `send`/`payMany`/`planUpstream` accept and forward `changeAddress`.

Not touched (scope): AUD-19 pending-spend (`spendableUtxos = matureUtxos` comment block stays for step (c)); `sdk.tx.plan`'s `console.log("DEBUG SDK TX PLAN…")` (pre-existing noise, noted); docs pages `planning.md` (docs gates do not run in CI; noted).

## 5. Verification

| Run | Result |
|---|---|
| `w2b-after1` → `after4` | 5/10 → 7/10 → … → green (network-profile misuse in the test, planner-error classification, execution-guard fixture) |
| directed set `w2b-fallout1` (cli, sdk, toolkit, tx-builder trees, CLI dist rebuilt: 282 files) | **524 passed / 0 failed / 14 skipped**, PASS |
| `pnpm typecheck` | 0 errors (55/55); native `.node` restored |
| `pnpm version:check` | all at `0.12.0-rc.23` |
| lint (cli, sdk, toolkit) | only the 2 pre-existing `sdk` errors |
| Full hermetic gate `w2b-full1` | see §6 |

## 6. Full gate

`w2b-full1` (CLI dist rebuilt first): **836 files / 1884 tests / 1856 passed / 0 failed / 28 skipped (pre-existing)**, `gate-hermetic: PASS`, 0 non-loopback attempts, 579 s. Loopback targets unchanged since Wave 0 (127.0.0.1:18210 ×3, :19999 ×1, :7420 ×2, :8545 ×9). Previous gate (2(a)): 1851 → +5 tests (the new suite: 4, plus the re-based fixture counted as before). No source changed after the gate.

## 7. Derived decisions (for the reviewer)

1. The CLI's read snapshot is what the Generator sees: the provider handed to `planTransactionUpstream` returns the mature set read at `vBefore`, and the upstream maturity filter runs again over it (idempotent) — no second RPC read inside the planner, so the fingerprint/confirmation guards still bracket exactly one read.
2. `changeAddress` in the CLI accepts an account name or an address, resolved and compatibility-checked like `to`; in the simulator the historical `stateAddress` fallback remains when no explicit change is given.
3. A planner refusal is surfaced as `UpstreamPlannerError` (`code` = the planner's code when it has one, e.g. `INSUFFICIENT_FUNDS_UPSTREAM`), never as `RpcConnectionError`.
4. Address validity is now enforced on the CLI network path by the Generator (it was not by the legacy planner): fixtures with fake addresses stop planning — a property gain, recorded in the re-based suite.
5. Toolkit coverage is at the `planUpstream` level (the method `send`/`payMany` delegate to); a full `payMany` run needs a signer and an RPC and belongs to the toolkit's own suites.

## 8. Status

Wave 2(b): IMPLEMENTED — §6 green. Next per the ratified order: (c) AUD-19 pending-spend with mempool evidence, on this canonical planner.
