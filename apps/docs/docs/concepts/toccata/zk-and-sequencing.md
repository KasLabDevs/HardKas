# ZK Primitives & Sequencing

> **L1 Status:** ACTIVE CONSENSUS | **vProgs:** ACTIVE DEVELOPMENT / PROTOTYPE

While Covenants allow L1 state machines, highly complex applications (like Order Books or AMMs) are too computationally heavy to run directly in Kaspa Script.

Toccata introduces the foundational primitives required to move execution off-chain while using Kaspa L1 for verification and data settlement.

## `OpZkPrecompile` (KIP-16)

Toccata introduced `OpZkPrecompile`, a native Kaspa Script opcode that can verify Zero-Knowledge (ZK) proofs directly during UTXO validation.

**What it does:** It allows a transaction to prove that a complex off-chain computation was executed correctly, without Kaspa nodes needing to execute the computation themselves. They only verify the mathematical proof.

## Sequencer Commitments & User Lanes (KIP-21)

To build a high-throughput off-chain application, the application must be able to order its transactions and commit to that order on L1.

KIP-21 introduces partitioned sequencing commitments. Ordinary v1 transactions can carry "lane-oriented" data (User Lanes) in their payload. This allows an application to localize its activity to a specific lane, committing to off-chain state transitions.

> **Note:** A "lane" is not a shard, nor is it an independent blockchain. It is simply a structured partition of metadata embedded within standard Kaspa L1 transactions.

## The Boundary: L1 Primitive vs Based App

Do not confuse the L1 capabilities with the application framework being built on top of them.

* **L1 ZK Primitives (Active):** Kaspa currently supports verifying specific proof tags via `OpZkPrecompile` at the consensus layer.
* **Based ZK Applications / vProgs (Prototype):** The `vProgs` framework—which aims to orchestrate off-chain provers, sequencers, and automatic L1 settlement using these primitives—is currently in **Active Development / Prototype**.

HardKAS does not currently provide qualified orchestration for `vProgs`.

