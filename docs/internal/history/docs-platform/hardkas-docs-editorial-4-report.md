# HardKAS DOCS-EDITORIAL-4 Report
**Date:** September 24, 2026
**Target:** Transaction Construction, Planning, Signing & Submission

## 0. EDITORIAL-3 CONTRACT AUDIT
Before writing Phase 4, we performed a strict validation of the claims introduced in EDITORIAL-3 to ensure they accurately match current implementation boundaries.

- **CANONICAL_STORE_CLAIM: VERIFIED (Broadened to include events)**
  `.hardkas/artifacts/` is indeed the durable store for all JSON artifacts. However, `query-store sync` also reads `.hardkas/events.jsonl`. We updated the documentation to reflect that the Canonical Store encompasses both the artifacts directory and the events ledger on disk.
- **QUERY_STORE_RECONSTRUCTION: CORRECTED**
  The absolute claim "100% reconstructed" was downgraded to "can be reconstructed as a derived read model".
- **VERIFY_SEMANTICS: CORRECTED**
  We corrected `verify-evidence.md`. Single-file `hardkas verify` *does* attempt `verifyArtifactReplay` if strictly requested/supported, but recursive workspace verify defaults to just checking integrity and DAG semantic continuity.
- **REPLAY_RECONSTRUCTION: CORRECTED**
  The phrase `reconstructStateAtDaa(receiptDaa - 1)` was a stale markdown artifact leftover in `replay.md`. We removed it completely, leaving just the behavioral contract without exposing a legacy internal heuristic.
- **RESOLVER_MODEL: VERIFIED**
  The documentation correctly limits the `explain` resolver to `artifactId` and filepath, honoring Wave11 invariants while not artificially polluting the legacy `planId` fallback route.

**EDITORIAL_3_CONTRACTS: CORRECTED**

## 1. TRANSACTION PLANE MODEL
We mapped the exact orchestrator ownership boundaries across HardKAS.
- **UTXO Discovery:** Handled by HardKAS (Safety wrapper: maturity +10n margin, pending-spend, virtual fingerprinting).
- **Planning:** Delegated to the planner implementation.
- **Signing:** Handled by HardKAS (ECDSA/Schnorr wrappers).
- **Submission:** Handled by HardKAS orchestrator (simulated JSON store vs Kaspa JSON-RPC).

**TRANSACTION_PLANE_MODEL: ESTABLISHED**

## 2. PLANNER PATHS & AUTHORITY
We strictly documented the current reality, avoiding any future "Candidate B unification" claims in public documentation.

| Surface | Environment | Planner Implementation | `plannerAuthority` Evidence |
|---------|-------------|------------------------|-----------------------------|
| **CLI** (`tx plan`) | Simulator | Internal `buildPaymentPlan` | *Absent (Legacy behavior)* |
| **CLI** (`tx plan`) | Real Node | Internal `buildPaymentPlan` | *Absent (Legacy behavior)* |
| **SDK** (`tx.plan()`) | Simulator | Internal `buildPaymentPlan` | `SYNTHETIC_SIMULATOR` |
| **SDK** (`tx.plan()`) | Real Node | Kaspa-WASM 2.0.1 Generator | `KASPA_WASM_GENERATOR` |

**PLANNER_PATHS: VERIFIED**
**PLANNER_AUTHORITY: VERIFIED**

## 3. ADDITIONAL MODELS
- **CHANGE_ADDRESS_MODEL: VERIFIED** (Wave13 behaviors documented: default to sender, strictly validated against network).
- **FEE_MASS_MODEL: VERIFIED** (Upstream authority when using WASM generator; internal estimation when using legacy).
- **SIGNING_MODEL: VERIFIED** (`SignedTxArtifact` boundaries clearly defined as *authorization*, not execution).
- **SUBMISSION_MODEL: VERIFIED** (Receipts explicitly separated from finality/mining confirmation).

## 4. DOCUMENTATION
The following canonical pages were created and integrated into Docusaurus:
- `/docs/concepts/transactions/index.md`
- `/docs/concepts/transactions/utxos.md`
- `/docs/concepts/transactions/planning.md`
- `/docs/concepts/transactions/fees-and-mass.md`
- `/docs/concepts/transactions/signing.md`
- `/docs/concepts/transactions/submission.md`
- `/docs/concepts/transactions/error-model.md`

We also added three focused guides for developer workflows:
- `/docs/guides/transactions/create-a-transaction.md`
- `/docs/guides/transactions/sign-a-transaction.md`
- `/docs/guides/transactions/submit-a-transaction.md`

## 5. FINAL STATUS
- **BUILD:** PASS
- **DOCS-EDITORIAL-4:** PASS

**NEXT:** DOCS-EDITORIAL-5 (CLI Reference)
