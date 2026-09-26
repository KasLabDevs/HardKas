# HardKAS 0.12.0-rc.23 — Docs Editorial 12: vProgs, Based ZK Apps & L2 Boundaries

## Status: PASS

## 0. EDITORIAL-11 Precision Audit
* **EDITORIAL_11_PRECISION:** `PASS`
* **PSKT_V1_COMPATIBILITY:** `STRUCTURALLY_SUPPORTED`. While upstream `rusty-kaspa v2.1.0` preserves v1 metadata (compute budget, bindings) during PSKT offline signing, HardKAS relies on this structural pass-through rather than executing exhaustive local extraction tests for every field.
* **HARDKAS_COVENANT_EXECUTION:** `VERIFIED`. `genesis` and `transition` exist and execute natively in the CLI against the localnet node.

## 1. Upstream Current State (Three-Column Model)
* **TOCCATA_PRIMITIVES:** `ACTIVE_CONSENSUS` (KIP-16, KIP-17, KIP-20, KIP-21).
* **VPROGS_RESEARCH:** `RESEARCH_DRAFT` (Spec v0.0.1).
* **VPROGS_IMPLEMENTATION:** `ACTIVE_DEVELOPMENT_PROTOTYPE`. The `kaspanet/vprogs` repo contains active code for core, storage, state, scheduling, transaction-runtime, node, and zk, but explicitly designates itself as an evolving prototype.

## 2. Based Computation & Execution Model
* **BASED_COMPUTATION_MODEL:** `ESTABLISHED`. Defined strictly as deriving application sequencing from Kaspa's L1 consensus-committed transaction order (KIP-21). Kaspa L1 does not run a sequencer for the application.
* **VPROGS_EXECUTION:** `OFF_CHAIN`. Kaspa L1 does not execute the application VM.
* **VPROGS_PROVING:** `OFF_CHAIN`. The ZK proving pipeline (RISC Zero transaction, batch, and aggregate proofs) runs entirely off-chain.
* **L1_VERIFICATION_BOUNDARY:** `ACTIVE_CONSENSUS`. Kaspa L1 validates the settlement transaction and verifies the proof via `OpZkPrecompile`.

## 3. ZK Pipeline & Security Models
* **PROOF_STATEMENT_IDENTITY:** `ESTABLISHED`. Highlighted the critical security boundary: a valid proof must be bound to the correct image ID, covenant ID, and sequencing commitment. Noted open upstream development issues regarding cache identity and statement binding.
* **DEPOSITS / EXITS:** `PROTOTYPE / SPEC_ONLY`.
* **REORG_HANDLING:** `PROTOTYPE`. Asynchronous proof latency means vProgs nodes must handle rollbacks of pending off-chain execution if Kaspa L1 reorgs.
* **DATA_AVAILABILITY:** `PARTIAL / OPEN`. Clarified that KIP-21 sequencing commitments do not automatically solve application DA; witness serving and data retention remain operator responsibilities.

## 4. HardKAS vProgs & ZK Surface
* **HARDKAS_VPROGS:** `STRUCTURAL_ONLY`.
  * Audit of `packages/cli/src/commands/vprogs.ts` and `packages/sdk/src/vprogs.ts` reveals a strict `INSPECT_ONLY` surface.
  * HardKAS inspects artifact schemas (e.g., `VProgsCapabilitiesV1`) but explicitly reports `vProgsRuntime: "NOT_CLAIMED"` and `zkOnchainVerification: "NOT_CLAIMED"`.
  * HardKAS does NOT currently orchestrate vProgs execution, RISC Zero proving, or settlement generation.
* **HARDKAS_ZK:** `STRUCTURAL_ONLY`.

## 5. L2 & EVM Boundaries
* **IGRA:** `EXTERNAL_IMPLEMENTATION`.
* **KASPLEX_L2:** `EXTERNAL_ARCHITECTURE`.
* **VPROGS_VS_EVM_L2:** Explicitly separated vProgs (sovereign verifiable programs) from EVM-compatible based rollups. Toccata is not an EVM hard fork.
* **BRIDGE_SECURITY_MODEL:** Deconstructed "trustless". A ZK-enforced exit (validity proof) removes MPC correctness trust, but liveness, censorship resistance, and DA assumptions remain.

## Final Summary
EDITORIAL_11_PRECISION: PASS
TOCCATA_PRIMITIVES: ACTIVE_CONSENSUS
VPROGS_RESEARCH: RESEARCH_DRAFT
VPROGS_IMPLEMENTATION: ACTIVE_DEVELOPMENT_PROTOTYPE
VPROGS_EXECUTION: OFF_CHAIN
VPROGS_PROVING: OFF_CHAIN
L1_SETTLEMENT_PRIMITIVES: ACTIVE_CONSENSUS
VPROGS_SETTLEMENT_IMPLEMENTATION: PROTOTYPE
DEPOSITS: PROTOTYPE
EXITS: PROTOTYPE
REORG_HANDLING: PROTOTYPE
DATA_AVAILABILITY: PARTIAL
COMPOSABILITY: RESEARCH_OBJECTIVE
HARDKAS_VPROGS: STRUCTURAL_ONLY
HARDKAS_ZK: STRUCTURAL_ONLY
IGRA: EXTERNAL_IMPLEMENTATION
KASPLEX_L2: EXTERNAL_ARCHITECTURE
QUALIFICATION: NOT_ESTABLISHED (vProgs orchestration not implemented)
BUILD: PASS
DOCS-EDITORIAL-12: PASS

**NEXT:** DOCS-EDITORIAL-13 — Advanced Operations / Troubleshooting / Production Boundaries
