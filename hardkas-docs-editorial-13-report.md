# HardKAS 0.12.0-rc.23 — Docs Editorial 13: Operations & Failure Contract

## Status: PASS

## 0. Micro-audit of HardKAS Errors
Before writing the taxonomy, the `packages/cli` and `packages/accounts` / `tx-builder` source code was audited for typed exceptions. 
* Identified errors: `INVALID_PRIVATE_KEY_MATERIAL`, `ACCOUNT_NETWORK_MISMATCH`, `SIGNER_ERROR`, `COIN_SELECTION_INVALID_AMOUNT`, `FEE_ESTIMATOR_INVALID_RATE`, `WORKSPACE_NOT_FOUND`, `REPLAY_DIVERGED`, `RPC_SCHEMA_ERROR`, `CONNECTION_REFUSED`, `TIMEOUT`, `DNS_FAILURE`, `INTEGRITY_FAILED`, `POLLING_ERROR`.
* **Recovery Actions:** Verified that deleting `.hardkas/query-store` is safe (rebuildable index), while deleting `.hardkas/artifacts` or `.hardkas/accounts.real.json` is destructive and causes irreversible loss of provenance/keys.

## 1. Operational Boundaries
* **Separation of Domains:** Documented the strict borders between the CLI wrapper process, the RPC Node daemon, and the target P2P network.
* **State Ownership:** Clarified that the `Query Store` is a pure Read-Model (100% rebuildable), whereas artifacts and keystores represent canonical/source-of-truth state.

## 2. Failure Taxonomy & Causal Troubleshooting
* **Diagnostic Matrix:** Mapped the specific `HardkasCliError` codes to operational boundaries (Workspace, Node/RPC, Accounts/Signing, Planning, Artifacts, Submission).
* **Causal Chain:** Established `Symptom -> Boundary -> Diagnostic Command -> Evidence -> Safe Recovery`. This prevents random guessing and dangerous fixes.
* **Prohibited Advice:** Imposed a strict rule against advising `rm -rf .hardkas/` as a generic troubleshooting step.

## 3. Production Boundaries (As of Sep 2026)
Frozen upstream states:
* **KASPA_CURRENT_NODE_RELEASE:** `v2.1.0` (Hardening and SDK extraction post-Toccata)
* **TOCCATA_CONSENSUS:** `ACTIVE` (Includes KIP-24 for Tx v1 hashing and KIP-25 for script pricing)
* **SILVERSCRIPT:** `OFFICIAL RELEASE v1.0.0`
* **VPROGS_SPEC:** `RESEARCH / DRAFT`
* **VPROGS_IMPLEMENTATION:** `ACTIVE DEVELOPMENT / PROTOTYPE`
* **HARDKAS_VPROGS & ZK:** `STRUCTURAL_ONLY`

**Global Qualification:** `NOT_ESTABLISHED`. HardKAS Covenants and Based Apps orchestration are not yet certified for Mainnet production, blocked by policy and lack of deterministic SDK compute-budget estimators.

## 4. Runbook & Security Modes
* **Minimal Runbook:** Created a step-by-step checklist based exclusively on generating and verifying evidence (`env` -> `rpc health` -> `tx plan` -> `inspect` -> `tx send` -> `explain`).
* **Security Traps:** Explicitly warned about `--unsafe-plaintext` exposing real keys, Network Mismatches, PSKT manipulation by Coordinators, and the critical danger of Artifact Provenance Loss.

## Final Summary
EDITORIAL_12_PRECISION: PASS
OPERATIONAL_BOUNDARIES: ESTABLISHED
FAILURE_TAXONOMY: MAPPED_TO_CODE
RECOVERY_MODEL: VERIFIED
CAUSAL_TROUBLESHOOTING: ESTABLISHED
PRODUCTION_BOUNDARIES: FROZEN
RUNBOOK: ESTABLISHED
SECURITY_MODES: ESTABLISHED
BUILD: PASS
DOCS-EDITORIAL-13: PASS

**NEXT:** FINAL_REVIEW / PUBLISH
