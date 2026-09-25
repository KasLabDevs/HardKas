# HardKAS 0.12.0-rc.23 — Docs Editorial 11: Toccata, Covenants & SilverScript

## Status: PASS

## 0. EDITORIAL-10 Precision Audit
* **PSKT_FINALIZE_SEMANTICS:** `VERIFIED` (Delegated). HardKAS relies entirely on upstream Kaspa's native `psktFinalize` to evaluate spending conditions. HardKAS does not inspect scripts itself.
* **PSKT_EXTRACT_SEMANTICS:** `VERIFIED` (Delegated). Extraction strictly fails unless the upstream state is finalized.
* **PSKT_OFFLINE_REQUIREMENTS:** `VERIFIED`. The binary payload contains the UTXO values and scripts required for offline hardware signing.
* **PSKT_MULTI_PARTY_EVIDENCE:** `VERIFIED`. The `hardkas pskt merge` command successfully delegates to upstream `psktCombine`.

## 1. Upstream Current State (As of Sep 25, 2026)
* **TOCCATA_CONSENSUS_STATUS:** `ACTIVE_CONSENSUS`. Activated at DAA 474,165,565 (2026-06-30).
* **RUSTY-KASPA:** Latest verified post-fork is `v2.1.0`.
* **SILVERSCRIPT_STATUS:** `OFFICIAL_RELEASE_V1.0.0` (commit `3ed9733` on Sep 9, 2026).
* **VPROGS / ZK APPS:** `ACTIVE_DEVELOPMENT_PROTOTYPE`.

## 2. L1 Consensus Primitives (Toccata)
* **TRANSACTION_V1_MODEL:** `VERIFIED`. Documented the cryptographic identity matrix. `txid` does *not* commit to `compute_budget`, but `tx::hash` does.
* **COMPUTE_BUDGET_MODEL:** `VERIFIED`. Replaces `sig_op_count`. Distinguished explicitly from Mass and Fee (mempool policy).
* **COVENANT_MODEL:** `VERIFIED`. Defined strictly as UTXO spending constraints. Documented that P2SH addresses change as state evolves.
* **COVENANT_ID_MODEL:** `VERIFIED`. Clarified the KIP-20 tracking ID. It is a stable lineage identifier, not the identity of the state itself.
* **ZK_L1_PRIMITIVE:** `ACTIVE_CONSENSUS`. `OpZkPrecompile` verifies proofs natively on L1.

## 3. SilverScript & HardKAS Orchestration
* **SILVERSCRIPT_COMPILATION_MODEL:** `VERIFIED`. Clarified that SilverScript is a high-level language compiling to Kaspa Script, not a Virtual Machine like EVM.
* **HARDKAS_SILVER:** `VERIFIED`. The CLI supports `hardkas silver compile`, `inspect`, `verify`, `deploy`, and `spend`.
* **COMPILER_PROVENANCE:** `VERIFIED`. Artifacts track source hash, compiler version, and compiled script hash.
* **HARDKAS_COVENANTS:** `VERIFIED`. The CLI implements `hardkas silver covenant genesis` (binds a new output to a derived `covenant_id`) and `hardkas silver covenant transition` (advances the state via 1:1 bindings).

## 4. Boundaries & Security
* **PSKT_V1_COMPATIBILITY:** `VERIFIED`. Native adapter preserves v1 serialization, `compute_budget`, and covenant bindings during offline signing.
* **L1_VS_L2:** Explicitly separated L1 Covenants (executed on Kaspa natively) from L2 Networks (Igra/Kasplex) and Based ZK Apps (vProgs off-chain proving).
* **TRUST_MODEL:** Warned that "consensus validity" does not mean "bug-free application logic." Compiler trust is required unless manually auditing the compiled Kaspa Script byte-code.
* **JULY_RECONCILIATION:** Superseded the July 2026 internal documents where they speculated about Toccata activation and SilverScript stability. Both are now strictly active and official.

## Final Summary
EDITORIAL_10_PRECISION: VERIFIED
TOCCATA: ACTIVE_CONSENSUS
TRANSACTION_V1: VERIFIED
COVENANTS: VERIFIED
COVENANT_IDS: VERIFIED
SILVERSCRIPT: OFFICIAL_RELEASE_V1.0.0
HARDKAS_SILVER: VERIFIED
HARDKAS_COVENANTS: VERIFIED
PSKT_V1_COMPATIBILITY: VERIFIED
ZK_L1_PRIMITIVE: ACTIVE_CONSENSUS
VPROGS: ACTIVE_DEVELOPMENT_PROTOTYPE
QUALIFICATION: ESTABLISHED
BUILD: PASS
DOCS-EDITORIAL-11: PASS

**NEXT:** DOCS-EDITORIAL-12 — vProgs / Based ZK Apps / L2 Boundaries
