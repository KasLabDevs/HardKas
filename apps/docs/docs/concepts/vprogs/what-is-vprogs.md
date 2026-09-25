# What is vProgs?

> **vProgs Status:** ACTIVE DEVELOPMENT / PROTOTYPE | **Underlying Toccata Primitives:** ACTIVE CONSENSUS

The Kaspa Verifiable Programs (vProgs) framework is a sovereign, based-computation architecture designed to run highly complex applications off-chain while using Kaspa L1 for sequencing, data commitments, and ZK proof verification.

## The Canonical Invariant

> vProgs is an evolving based-computation runtime/prototype. Its execution and proving happen outside Kaspa L1; Kaspa provides ordering/commitment, proof-verification and covenant-settlement primitives.

Do not confuse vProgs with EVM L2 networks like Igra or Kasplex L2 Architecture. vProgs is a distinct research and implementation track for sovereign verifiable programs.

## Execution vs. Consensus Boundaries

The most common misconception is that Kaspa L1 executes vProgs applications natively. **It does not.**

| Domain | Execution Location | Validation Mechanism | Status |
| :--- | :--- | :--- | :--- |
| **Kaspa L1 Covenants** | Kaspa Node | Evaluates Kaspa Script during UTXO spend | `ACTIVE CONSENSUS` |
| **vProgs Execution** | Off-chain Runtime | Generates a ZK Validity Proof | `PROTOTYPE` |
| **vProgs Settlement** | Kaspa Node | Evaluates the ZK Proof via `OpZkPrecompile` | `ACTIVE CONSENSUS (Primitive)` |

Kaspa L1 validates only the specific L1 transaction, the Kaspa script constraints, and the ZK proof itself. It does not execute the application VM.

## The Three-Column Truth Model

When evaluating vProgs capabilities, you must strictly distinguish between what is intended, what exists in code today, and what is ready for production.

*As of September 25, 2026:*

| Capability | Research Target (July) | Current Repo Implementation | Production Evidence |
| :--- | :--- | :--- | :--- |
| **L1 Verification Primitives** | KIP-16 / KIP-21 | Toccata `OpZkPrecompile`, lanes | `ACTIVE CONSENSUS` |
| **Storage & State** | Versioned State, Rollbacks | Implemented (`core`, `storage`, `state`) | `PROTOTYPE` |
| **Scheduling** | Parallel execution, ordering | Implemented (`scheduling`) | `PROTOTYPE` |
| **Transaction Runtime** | Reference VM execution | Implemented (`transaction-runtime`) | `PROTOTYPE` |
| **RISC Zero Proving** | Batch proofs, aggregation | Implemented (`zk` module) | `PROTOTYPE` |
| **Atomic Composability** | Synchronous multi-program | `RESEARCH OBJECTIVE` | `NONE` |

## Repository Realities vs Research Drafts

The official `kaspanet/research` repository maintains the vProgs Protocol Specification as a Draft (`v0.0.1 Draft`). Meanwhile, the `kaspanet/vprogs` repository contains significant running code (including layers for state, scheduler, runtime, node, and zk proving pipelines). 

Despite the code activity, the official repository and the official Kaspa Docs explicitly designate vProgs as an **"evolving runtime"** and a **"prototype"**. Core components like the external APIs, reorg handling during proving, settlement fee bumping, and witness serving are still mobile targets.

Repository commit activity is not evidence of Mainnet production readiness.
