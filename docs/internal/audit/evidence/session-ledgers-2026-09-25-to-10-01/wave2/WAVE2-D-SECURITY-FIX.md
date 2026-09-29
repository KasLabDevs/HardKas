# Wave 2(d) security fix — signed outputs ↔ authorized plan (`WAVE_2D_SECURITY_REVIEW — BLOCK`, one blocker)

Mandate: fix ONLY the blocker "a signed transaction that economically differs from the TxPlan cannot become valid evidence by reinterpreting the difference as fee"; four regressions; directed 2(d) set; short review. No AUX-11.

## 1. Blocker, restated

`deriveSubmissionFee` matched inputs 1:1 but took the signed outputs as-is: a payload whose change was 7 sompi smaller than the plan authorized produced `fee.status: derived, feeSompi: +7` on a FULL submission naming that plan — the plan→signed binding of Wave 1 was silently relaxed at the economic level.

## 2. Fix (minimal, formula unchanged)

`packages/artifacts/src/submission-fee.ts`:
- **`checkSignedAgainstPlan(signedTransaction, plan)`** runs BEFORE any pricing:
  - inputs: 1:1 by outpoint, both directions, no repeats;
  - outputs: exactly the plan's payment outputs followed by its change — **same cardinality, same order, same amount, same destination**; extra, omitted or reordered outputs are a mismatch;
  - destination: the plan's address is decoded (`decodeKaspaAddress`, Kaspa bech32 charset, version byte + payload) into the standard script it denotes (`expectedScriptPublicKeyHex`: v0 Schnorr P2PK `20…ac`, v1 ECDSA `21…ab`, v8 P2SH `aa20…87`) and compared with the signed output's `scriptPublicKey`; a signed output without a script, or a plan address that is not a standard Kaspa address, is a mismatch (fail closed), unless the payload itself carries an address that equals the plan's;
  - a payload that cannot be parsed stays `insufficient`; one that parses and diverges is **`mismatch` / `SIGNED_PLAN_MISMATCH`** (positive evidence).
- `deriveSubmissionFee` returns `{ status: "mismatch", code: "SIGNED_PLAN_MISMATCH", reason }` for a divergent payload; `derived` only after the equivalence holds.

`packages/sdk/src/tx.ts` (`send`, real path): a mismatch throws `HardkasError("SIGNED_PLAN_MISMATCH")` **before** `submitTransaction` — nothing is broadcast and no submission is written. The persisted `fee` union is unchanged (`derived | insufficient-evidence`): a mismatch is never recorded as a submission.

Order is exact (payment outputs, then change) as recommended: the txid commits to output order, the upstream Generator emits payments then change, and nothing in the plan contract declares order irrelevant.

## 3. Regressions

`packages/artifacts/test/adversarial/wave2-d-submission-fee.test.ts` (derivation level):

| # | Case | Result |
|---|---|---|
| 1 | plan and signed economically identical | `derived` (25 = 1500 − 1475) ✓ |
| 2 | signed change 7 sompi smaller | `SIGNED_PLAN_MISMATCH` "change: pays 868 but the plan authorizes 875", no `feeSompi` key ✓ |
| 3 | payment amount changed, same inputs | `SIGNED_PLAN_MISMATCH` (output[0]) ✓ |
| 4 | extra output / omitted change / reordered (change first) / payment redirected / change redirected / output without script / foreign input / plan input not spent / repeated input | `SIGNED_PLAN_MISMATCH`, each with its reason ✓ |
| + | address decoding: prefix/version/32-byte payload, distinct scripts per address, non-addresses undefined; `insufficient-evidence` kept for opaque/missing payload, missing/unsealed plan, no outputs; a genuine zero fee only from a plan that authorizes it; verifier `SUBMISSION_FEE_INCOHERENT`; simulated receipt balance rules | ✓ |

`packages/sdk/test/adversarial/wave2-d-send-fee.test.ts` (send boundary; the plan is a real-network Generator plan over a scripted node with real `kaspasim:` addresses; the signed is re-issued from it with an RPC-transaction payload):

| # | Case | Result |
|---|---|---|
| 0 | the scripts derived without WASM equal `kaspa-wasm` `payToAddressScript` for from/to/change | ✓ (decoder cross-checked against upstream) |
| 1 | identical | `derived`, equals the Generator's fee, authenticated (tampering breaks identity), FULL ✓ |
| 2 | change −7 | `SIGNED_PLAN_MISMATCH`; `submitTransaction` never called; no submission written ✓ |
| 3 | payment +1 | `SIGNED_PLAN_MISMATCH`, not broadcast ✓ |
| 4 | extra / omitted / reordered / redirected payment / foreign input | `SIGNED_PLAN_MISMATCH` each, nothing broadcast, no submissions ✓ |
| + | opaque payload → `insufficient-evidence` with reason; never `"feeSompi":"0"`, never `estimatedFeeSompi` | ✓ |

## 4. Verification

| Run | Result |
|---|---|
| `w2d-fix2` (the two 2(d) suites) | **15 / 15** |
| directed 2(d) set `w2d-fix3` (artifacts, sdk, localnet, testing trees + the 2(b)/2(c) CLI suites: 296 files) | **706 passed / 0 failed / 5 skipped**, PASS hermetic |
| `pnpm typecheck` | 0 errors (55/55); native `.node` restored |
| lint (artifacts, sdk) / `version:check` | only the 2 pre-existing `sdk` errors / all at `0.12.0-rc.23` |
| Full gate | not re-run for this delta (per mandate: regressions + directed set); last full gate on this tree minus the fix: `w2d-full1` 1871/0/28 |

## 5. Derived decisions (for the short review)

1. **Fail closed on destinations**: if a plan address is not a standard Kaspa address (e.g. the simulator's `kaspa:sim_*`), a real send is refused unless the payload itself names the same address. Real-network plans always carry Generator-validated addresses, and simulator artifacts never reach the real send path (`SYNTHETIC_NOT_BROADCASTABLE`), so this only bites hand-crafted payloads.
2. **Address checksum is not verified** by the decoder (the node validates addresses; the check here compares destination bytes). Wrong-charset or wrong-length input decodes to `undefined` → mismatch.
3. **Input divergence** (a signed input not in the plan, a plan input not spent, a repeated input) is now `SIGNED_PLAN_MISMATCH` too (positive evidence), consistent with the reviewer's pre-check; unparseable payloads remain `insufficient-evidence`.
4. `verifySignedTxSemantics` (VULN-05, label-level `sourcePlanId`/amount/network) still runs after this check; the new check is the economic binding it never had.

Nothing else changed. Version `0.12.0-rc.23`; nothing committed.
