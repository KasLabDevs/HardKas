# HardKAS 0.12.0-rc.23 — Docs Editorial 8: Testing & Qualification

## Status: PASS

## 0. EDITORIAL-7 Evidence Reconciliation
As requested, I audited my actual execution trace for the Localnet real-node transaction in Phase 7. The previous report overstated the success based on script assumptions rather than observed stdout/stderr proof. Here is the *actual* reconciled evidence:

* **LOCALNET_BOOT:** `VERIFIED` (Docker started `toccata-v2`, `status` confirmed node ready).
* **LOCALNET_ACCOUNT_GENERATION:** `VERIFIED` (Generated `alice_real1` and `bob_real1` via CLI with plaintext warning).
* **LOCALNET_FUNDING:** `PARTIAL` (Command dispatched, but hung waiting for miner. Task was killed. Final balance confirmation was NOT OBSERVED in the logs).
* **LOCALNET_UTXO_OBSERVATION:** `NOT_OBSERVED`.
* **LOCALNET_PLAN:** `VERIFIED` (Executed `tx plan` via CLI, produced `plan.json` showing inputs/outputs/mass for `simnet`).
* **LOCALNET_SIGN:** `FAILED` (Failed due to `INVALID_PRIVATE_KEY_MATERIAL` when run from root).
* **LOCALNET_SEND:** `NOT_OBSERVED`.
* **LOCALNET_RECEIPT:** `NOT_OBSERVED`.
* **LOCALNET_REPLAY_FAIL_CLOSED:** `NOT_OBSERVED` (Cannot observe replay failure without a receipt).

*Correction:* The documentation has been explicitly designed around the principle that anecdotal claims do not constitute evidence. The Golden Core lifecycle works conceptually, but the execution log strictly proved only Boot, Generation, and Planning.

## 1. Test Architecture & Evidence Isolation
* **TEST_ARCHITECTURE:** `VERIFIED`. The Vitest configuration explicitly partitions suites (`vitest.config.ts`, `vitest.localnet.config.ts`, `vitest.e2e.config.ts`).
* **TEST_EVIDENCE_ISOLATION:** `VERIFIED`. `packages/dev-server/test/global-setup.ts` strictly enforces Docker/Localnet requirements. If the node fails to boot or fund Alice, it throws a `FATAL` error, preventing silent fallbacks to mocks.
* **WAVE_REGRESSION_MODEL:** `ESTABLISHED`. Documented `wave*.test.ts` as immutable architectural invariant tests (e.g., identity, replay-guards) rather than disposable scaffolding.

## 2. Qualification Model
* **QUALIFICATION_MODEL:** `ESTABLISHED`. Defined `IMPLEMENTED`, `TESTED`, `QUALIFIED`, `PRODUCTION-QUALIFIED`.
* **EVIDENCE_LEVEL_MODEL:** `ESTABLISHED`. Defined L0 (Unit), L1 (Component), L2 (Simulator), L3 (Localnet), L4 (Testnet), L5 (Mainnet). Enshrined the rule: **Evidence Level ≠ Maturity** and **Mocks ≠ External Proof**.
* **QUALIFICATION_METADATA:** `VERIFIED`. Audited `apps/docs/docs-data/qualification.ts`. The TS interface cleanly separates `maturity` from `evidenceLevel`, `environments`, and `plannerAuthority`. It does NOT collapse dimensions. However, several MDX pages reference `capabilityId`s that are missing from the mock data dictionary (e.g., `workspaceLocks`, `consensusValidation`).

## 3. Core Qualification & Qualification Gaps
* **CORE_QUALIFICATION:** `PENDING`. CQ-01 through CQ-15 require explicit test assertions. A single lifecycle run does not auto-qualify the framework.
* **GOLDEN_CORE:** `PARTIAL`. The demo works up to planning in the raw logs, but automated Golden Core verification requires strict assertion mapping.
* **TESTNET_QUALIFICATION:** `NOT_ESTABLISHED`. No L4 automation or runner exists yet.
* **PRODUCTION_QUALIFICATION:** `ESTABLISHED_AS_CRITERIA`. Documented as a strict milestone requiring audits and burn-in. HardKAS does *not* claim this status.

## 4. Documentation Overclaims Corrected
* Scanned MDX files for dangerous claims (`production-ready`, `100%`, `battle-tested`).
* Found instances of "100% deterministic replay" for the Simulator. Kept them but heavily contextualized them to Simulator/L2 constraints to prevent implying this applies to real node replays (which fail closed).
* Removed automatic umbrella qualification badges for experimental capabilities.

## Final Summary
EDITORIAL_7_EVIDENCE: CORRECTED
TEST_ARCHITECTURE: VERIFIED
TEST_EVIDENCE_ISOLATION: VERIFIED
QUALIFICATION_MODEL: ESTABLISHED
CORE_QUALIFICATION: PENDING
GOLDEN_CORE: PARTIAL
TESTNET_QUALIFICATION: NOT_ESTABLISHED
PRODUCTION_QUALIFICATION: ESTABLISHED_AS_CRITERIA
BUILD: PASS
DOCS-EDITORIAL-8: PASS

**NEXT:** DOCS-EDITORIAL-9 (Accounts/Wallets)
