# Wave 2(e) — AUX-11 · `tx send` ends in one of three unambiguous outcomes

Mandate (`GO WAVE 2(e)`): AUX-11 únicamente. Property to close: *a command called `tx send` must end as **submitted**, **explicitly declined / not executed**, or **failed**; a no-op can never look submitted nor return an ambiguous success to automation.* Version `0.12.0-rc.23`. Commit state: the owner committed the working tree mid-task as `59d5a1709` (`[KLD]: 0.12.0-rc.23 version`, 2026-09-26 15:38); verified that it contains the final 2(e) code (`tx.ts` with both fixes) and tests (6 cases + the 1.5 assertion). Still uncommitted: the regenerated `docs/reference/cli.md` + `cli.generated.json`. Untracked and not mine: three `HARDKAS-RC23-*AUDIT*.md` files at the repo root. I committed nothing.

## 1. Reproduction (BEFORE)

Two instances of the same defect, both in `packages/cli/src/commands/tx.ts` (`tx send`):

| # | Path | BEFORE | Evidence |
|---|---|---|---|
| E1 | `tx send <signed.json>` and `tx send --from --to --amount` on a non-simulated network **without `--yes`** | `UI.dryRun()` printed `[DRY RUN] No persistent artifacts were written. Use --yes` to stderr and the command **returned normally: exit 0**, stdout empty (human) or empty (`--json`, no envelope at all). Automation saw success. | `w2e-before`: the three T-AUX11 cases fail with `expected +0 to be 3` |
| E2 | `tx send --from --to --amount` (shortcut mode) on **any** network, `--yes` or not | the command never forwarded the confirmation to `runTxFlow` (`yes` absent), so the flow's own guard left the send step `blocked` ("--yes is required to broadcast"); the command then computed `flowAccepted = status === "ok" ? … : true` → **true**, printed `Transaction simulated successfully` / `Artifact ID: unknown` / `Tx ID: unknown` (human) or `ok: true` with `data.receipt: undefined` (`--json`) and **exited 0**. The same computation reported success when the plan or sign step **errored** (send step still `skipped`). | `w2e-after` (after fixing E1 only): control `expected undefined` receipt at exit 0; the 1.5 narratives test had baked this in (`Transaction simulated successfully` asserted without checking the receipt) |

E2 was found by the control test of E1 and is the same property on the same command (a no-op that reads as submitted), so it is fixed here and flagged for the reviewer (§5.1).

## 2. Fix (minimal)

`packages/cli/src/commands/tx.ts`

- **`declineUnconfirmedSend()`** replaces both `UI.dryRun(); return;` guards. Without `--yes` on a network other than `simulated`/`simnet` the command now:
  - writes, in `--json`, the envelope `{ ok:false, command:"tx send", mode:"cli", outcome:"not_executed", code:"TX_SEND_CONFIRMATION_REQUIRED", network, message, nextSteps:[<same command> --yes] }` (so the top-level handler does not emit a second envelope);
  - throws `HardkasCliError("TX_SEND_CONFIRMATION_REQUIRED", "NOT EXECUTED: 'tx send' on <network> requires explicit confirmation. Nothing was planned, signed, broadcast or written. To execute, re-run with --yes.", { exitCode: 3 /* POLICY_DENIED */ })`. Human mode prints `✗ [TX_SEND_CONFIRMATION_REQUIRED] NOT EXECUTED: …` on stderr.
  - Nothing is read from the node, nothing is written. The `--yes` option text now states the rule.
- **Shortcut path**: `runTxFlow` receives `yes: options.yes || confirmationExempt` (exempt = `simulated`/`simnet`, the command's existing policy). The outcome is derived **from the send step only**:
  - `status === "ok"` → `submitted` (`accepted !== false`, exit 0) or `rejected` (`TX_SUBMISSION_REJECTED`, exit 1, unchanged);
  - a step (`plan`/`sign`/`send`) with `status === "error"` → **failed**: `TX_SEND_FAILED`, exit 1, message `FAILED: 'tx send' did not broadcast (<step> step failed: <error>)`, JSON `outcome:"failed"` + `steps:{plan,sign,send}`;
  - send step `blocked`/`skipped` with no error → **not executed**: `TX_SEND_NOT_EXECUTED`, exit 3, `outcome:"not_executed"` (defensive now that `yes` is forwarded; it is what the old code turned into success).
- Success envelopes (both paths) carry `outcome: "submitted" | "rejected"` next to `ok`.

Outcome matrix after the fix:

| Result | exit | JSON `ok` | JSON `outcome` | code |
|---|---|---|---|---|
| broadcast accepted (or simulated executed) | 0 | true | `submitted` | — |
| broadcast rejected by the node | 1 | false | `rejected` | `TX_SUBMISSION_REJECTED` |
| confirmation missing (non-simulated) | 3 | false | `not_executed` | `TX_SEND_CONFIRMATION_REQUIRED` |
| flow never reached the send step, no error | 3 | false | `not_executed` | `TX_SEND_NOT_EXECUTED` |
| plan / sign / send step errored | 1 | false | `failed` | `TX_SEND_FAILED` |

`UI.dryRun()` itself is untouched (no other caller in `src/`). `runTxFlow` internals untouched.

## 3. Regressions

`packages/cli/test/wave2-e-send-outcome.test.ts` (spawned CLI against the built dist, bootstrapped simulated workspace):

| # | Case | Result |
|---|---|---|
| T-AUX11.1 | shortcut, `--network testnet-10`, no `--yes` | exit 3, output has `NOT EXECUTED` + `TX_SEND_CONFIRMATION_REQUIRED` + `--yes`, no `successfully|submitted|DRY RUN`, artifact tree unchanged ✓ |
| T-AUX11.2 | same with `--json` | exit 3, envelope `ok:false, command:"tx send", outcome:"not_executed", code, network:"testnet-10"`, `nextSteps` contains `--yes`, no `submitted|dry` ✓ |
| T-AUX11.3 | signed-artifact mode (`testnet-10` signed, valid v5, no `--yes`) | exit 3, same envelope, artifact tree unchanged, no RPC ✓ |
| control 1 | shortcut `--network simulated --json` | exit 0, `ok:true`, `outcome:"submitted"`, `data.receipt.txId = synthetic-<64hex>`, `data.receipt.contentHash`, artifacts written ✓ (**BEFORE**: exit 0 with no receipt) |
| control 2 | same, human | `Transaction simulated successfully` backed by `Artifact ID <64hex>`, never `unknown` ✓ |
| T-AUX11.4 | shortcut, amount 10¹² KAS on the simulator (plan step fails) | exit 1, `ok:false, outcome:"failed", code:"TX_SEND_FAILED"`, `steps.send ≠ ok`, message names the plan failure, no receipt/submission written ✓ (**BEFORE**: exit 0, success printed) |

`packages/cli/test/wave1-5-narratives-cli.test.ts`: one assertion added (`Artifact ID` never `unknown` behind the success line) — the 1.5 test that had accepted E2.

## 4. Verification

| Run | Result |
|---|---|
| `w2e-before` (new suite, old dist) | 0 / 4 — reproduces E1 (exit 0 ×3) |
| `w2e-after` (E1 fix only) | 3 / 4 — reproduces E2 (control: success with no receipt) |
| `w2e-after2` (both fixes: 2(e) suite + 1.5 narratives) | **9 / 9** |
| directed set `w2e-cli` = whole `packages/cli/test` (130 files) | **241 passed / 0 failed / 9 skipped**, PASS hermetic |
| `pnpm typecheck` | 0 errors (55/55); native `.node` restored |
| `pnpm --filter @hardkas/cli lint` | 3 errors, all pre-existing in untouched files (`src/runners/torture-runner.ts` 458/493 irregular whitespace; `templates/wallet-backend/src/domain/WalletService.test.ts` parsing error); 0 in the files changed here |
| `docs:check-cli` → regenerated `docs/reference/cli.md` + `cli.generated.json` | only two option rows changed: `tx plan --change` (2(b) drift) and `tx send --yes` (this wave) |
| Full hermetic gate `w2e-full1` (HEAD `59d5a1709` + regenerated docs) | **844 files / 1884 passed / 0 failed / 28 skipped**, PASS, 0 non-loopback attempts, 622 s (previous gate 2(d): 1871/0/28; +13 = 6 new 2(e) cases + 7 from the 2(d) fix suites not in that gate) |

## 5. Derived decisions (for the review)

1. **E2 fixed under AUX-11.** It is the same property (no-op reads as submitted) on the same command, found by the control of E1. Only the command's outcome derivation and the missing `yes` forwarding changed; `runTxFlow` was not touched. If the reviewer prefers E2 as a separate item, the diff is separable (the `flowSend.status !== "ok"` block + `yes:`).
2. **Exit codes**: refusal / not-executed = `3` (`POLICY_DENIED`, the only existing code meaning "declined by policy"); failures = `1`. No new exit code was introduced.
3. **Simulated / simnet stay exempt from `--yes`** (pre-existing command policy, not re-decided here). The shortcut path now honours it for real: a simulated `tx send` executes and writes a receipt instead of silently blocking.
4. **Errors swallowed by `runTxFlow`** (it catches and records `steps.<step>.error` as a string) surface as `TX_SEND_FAILED` exit 1 with the message; the original code (e.g. a policy error inside the flow) is not recoverable from the flow result. Explicit failure, non-zero exit — acceptable for AUX-11; a typed pass-through would be a `runTxFlow` change (not in scope).
5. `docs/reference/cli.md` is generated (`docs:generate-cli`); regenerating it also picked up the `--change` row from 2(b) that had not been regenerated then.

Nothing else changed. Version `0.12.0-rc.23`; nothing committed.
