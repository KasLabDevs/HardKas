# Wave 2(d) ledger — AUD-18 (real fee in submission / receipt evidence)

Order: REPRODUCE → TEST FAILING → MINIMAL FIX → TARGETED PASS → FULL REGRESSION.
Base: Wave 2(c) tree (`WAVE_2C_SECURITY_REVIEW — PASS`), uncommitted. Version stays `0.12.0-rc.23`. No commits by me.
Mandate (`GO WAVE 2(d)`, AUD-18 only): the fee must not come from estimated metadata once the signed transaction exists; derive it from what the transaction consumes and produces when the evidence suffices; otherwise declare `insufficient evidence`, never fall back to `"0"`.

## 1. Finding / root cause (pre-2(d) tree)

| Label | Root cause |
|---|---|
| AUD-18 (network) | the audited line (`metadata?.estimatedFeeSompi \|\| "0"` in the network receipt) disappeared with R-iii part 1 (1.3), but its replacement, `hardkas.txSubmission.v1`, recorded **no fee at all**: the economic evidence of a real send was simply absent |
| AUD-18 (simulator) | `createSimulatedTxReceipt` copied `plan.estimatedFeeSompi` into `receipt.feeSompi` without checking that the executed plan actually consumes − produces that amount: a receipt could record a fee the execution did not charge |
| Legacy fallback | `normalizeSimulatedPlanInput` still fabricates a plan with `estimatedFeeSompi: "0"` for a simulated signed without a resolvable plan — unreachable since IC-6′ (the plan is always resolved by identity), flagged, not touched |

## 2. Reproduction BEFORE

Structural, quoted: `TxSubmissionSchema` had no `fee` field and `send()` wrote none; `createSimulatedTxReceipt` set `feeSompi: plan.estimatedFeeSompi` unconditionally. The new suites assert a `fee` block on every submission, `insufficient-evidence` on opaque payloads, and refusal of unbalanced simulated plans — all false on that tree.

## 3. Regression tests (written first)

| Test file | Property |
|---|---|
| `packages/artifacts/test/adversarial/wave2-d-submission-fee.test.ts` | `deriveSubmissionFee`: fee = Σ plan inputs (matched by outpoint to the signed inputs) − Σ signed outputs, with counts and the plan's artifactId; the signed outputs decide (a payload paying more changes the derived fee); **insufficient evidence, never 0** for: opaque hex, no payload, no/unsealed plan, a signed input not in the plan, a plan input not spent, outputs exceeding inputs, no outputs (and no `feeSompi` key is emitted in those records); a genuine zero fee (inputs = outputs) is a derivation, not a fallback; `parseSignedTransactionPayload` reads flattened and wrapped RPC shapes; the verifier flags an arithmetically false fee (`SUBMISSION_FEE_INCOHERENT`) and an unexplained insufficient-evidence record; the simulated receipt's fee is derived from the plan it executes, an unbalanced plan is refused (`RECEIPT_FEE_UNBALANCED`), a plan without inputs cannot produce a receipt (`RECEIPT_FEE_UNDERIVABLE`) |
| `packages/sdk/test/adversarial/wave2-d-send-fee.test.ts` | a real `send` (submit mocked) records `fee.status: derived` with Σ inputs/Σ outputs/fee equal to the balanced plan's declared fee, authenticated (altering it breaks the identity; FULL scope); a signed transaction whose change output is 7 sompi smaller yields a derived fee 7 sompi higher (the estimate is never copied); an opaque payload yields `insufficient-evidence` with its reason and the artifact contains neither `"feeSompi":"0"` nor `estimatedFeeSompi`; a payload spending an outpoint the plan does not describe cannot be priced |

## 4. Minimal diff

- `packages/artifacts/src/submission-fee.ts` (new): `parseSignedTransactionPayload`, `deriveSubmissionFee({ signedTransaction, plan })` → `{ status: "derived", method: "inputs-minus-outputs", inputsSompi, outputsSompi, feeSompi, inputCount, outputCount, planArtifactId } | { status: "insufficient-evidence", reason }`, `checkSubmissionFeeCoherence`; exported.
- `packages/artifacts/src/schemas.ts`: `TxSubmissionSchema.fee` (optional discriminated union; every new submission writes it).
- `packages/artifacts/src/verify.ts` + `packages/core/src/corruption.ts`: `SUBMISSION_FEE_INCOHERENT` in the submission semantics.
- `packages/artifacts/src/signed-tx.ts`: `deriveSimulatedFee(plan)`; `createSimulatedTxReceipt` records the derived fee and refuses `RECEIPT_FEE_UNBALANCED` / `RECEIPT_FEE_UNDERIVABLE`.
- `packages/sdk/src/tx.ts` (`send`, real path): resolves the signed's plan by its authenticated `lineage.parentArtifactId`, derives the fee, writes `fee` into the submission before hashing.

Not touched (scope): narratives (`sendExplanation`, `why`, CLI `tx send` output) — they will surface `fee` in step (f); `normalizeSimulatedPlanInput`'s dead `"0"` fallback (flagged); `TxObservation.mempool_entry.feeSompi` (the node's own reported fee, a separate observation) stays as is.

## 5. Verification

| Run | Result |
|---|---|
| `w2d-after1` (artifacts, sdk, localnet, testing trees: 292 files, includes both new suites, the R-iii producers/B2 suites and the reproducibility golden) | **688 passed / 0 failed / 5 skipped** first run |
| `pnpm typecheck` | 0 errors (55/55); native `.node` restored |
| `pnpm version:check` / lint (artifacts, sdk, core) | see §6 |
| Full hermetic gate `w2d-full1` | see §6 |

## 6. Full gate / freeze

- `w2d-full1` (CLI dist rebuilt first): **842 files / 1899 tests / 1871 passed / 0 failed / 28 skipped (pre-existing)**, `gate-hermetic: PASS`, 0 non-loopback attempts, 627 s. Loopback targets unchanged since Wave 0 (127.0.0.1:18210 ×3, :19999 ×1, :7420 ×2, :8545 ×9). Previous gate (2(c)): 1863 → +8 tests (the two new suites). No source changed after the gate; native binary and lockfile untouched.
- `pnpm version:check`: all packages at `0.12.0-rc.23`, no newer reference.
- lint (artifacts, sdk, core): only the 2 pre-existing `sdk` errors (`igra.ts:31`, `pskt/adapters/test-fake.ts:26`).

## 7. Derived decisions (for the reviewer)

1. **Consumed amounts come from the plan** (the signed's authenticated parent), matched one-to-one by outpoint with the signed inputs in BOTH directions; a Kaspa transaction does not carry input amounts, so the plan is the only in-workspace evidence of what was consumed. Any mismatch ⇒ `insufficient-evidence` with the offending outpoint.
2. **Produced amounts come from the signed transaction** (payment + change outputs as actually signed), never from the plan's outputs — which is why a payload paying more than planned raises the derived fee.
3. The `mempool_entry` observation's `feeSompi` (what the node reports) is left as an independent observation; reconciling it with the derived submission fee is a narrative/derivation step for (f), not done here.
4. The simulated receipt no longer trusts `estimatedFeeSompi`: it is recomputed from inputs − outputs − change; the golden `simulatedTxReceipt` hash did not move because the synthetic planner's plans are balanced.
5. `fee` is optional in the schema only so that submissions written by 1.3–2(c) code (tests, existing workspaces) keep verifying; `send()` always writes it now.

## 8. Status

Wave 2(d): IMPLEMENTED — §6 green. Checkpoint: `WAVE_2D_IMPLEMENTED — PENDING ADVERSARIAL REVIEW`. Next per the ratified order: (e) AUX-11 (`tx send` without `--yes` on a non-simnet network prints a dry-run and exits 0).
