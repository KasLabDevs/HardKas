---
title: What is vProgs?
description: Kaspa verifiable programs (vProgs) as an upstream prototype, where execution and validation happen, and what HardKAS does with them.
---

# What is vProgs?

> [!NOTE]
> **vProgs:** an upstream prototype in active development (`kaspanet/vprogs`, no releases). **The Toccata primitives
> it builds on:** active in Kaspa consensus. HardKAS has no vProgs runtime.

Kaspa verifiable programs (vProgs) are a sovereign, based-computation architecture: complex applications run off-chain,
and Kaspa L1 provides sequencing, data commitments and ZK proof verification.

## The invariant

> vProgs is an evolving based-computation runtime and prototype. Its execution and proving happen outside Kaspa L1;
> Kaspa provides ordering and commitment, proof verification and covenant-settlement primitives.

Do not confuse vProgs with EVM L2 networks such as Igra or the Kasplex L2 architecture: vProgs is a separate research
and implementation track (see [Layer 2 boundaries](../layer-2/boundaries.md)).

## Execution versus consensus

The most common misconception is that Kaspa L1 runs vProgs applications. **It does not.**

| Domain | Where it runs | How it is validated | Status |
| :--- | :--- | :--- | :--- |
| **Kaspa L1 covenants** | Kaspa node | Kaspa script, evaluated when a UTXO is spent | Active in consensus |
| **vProgs execution** | Off-chain runtime | Produces a ZK validity proof | Prototype |
| **vProgs settlement** | Kaspa node | Would check the proof with the `OpZkPrecompile` primitive | Primitive only: no vProgs settlement is claimed |

Kaspa L1 validates only the L1 transaction, its script constraints and the ZK proof. It does not execute the
application's VM.

## Intended, implemented, proven

When you read about vProgs, keep apart what is intended, what exists in code, and what has evidence. The upstream
state as of September 25, 2026 (HardKAS does not track it further):

| Capability | Research target | Upstream implementation | Evidence |
| :--- | :--- | :--- | :--- |
| **L1 verification primitives** | KIP-16, KIP-21 | Toccata `OpZkPrecompile`, lanes | Active in consensus |
| **Storage and state** | Versioned state, rollbacks | In code (`core`, `storage`, `state`) | Prototype |
| **Scheduling** | Parallel execution, ordering | In code (`scheduling`) | Prototype |
| **Transaction runtime** | Reference VM execution | In code (`transaction-runtime`) | Prototype |
| **RISC Zero proving** | Batch proofs, aggregation | In code (`zk` module) | Prototype |
| **Atomic composability** | Synchronous multi-program calls | Research objective | None |

## Repository and drafts

The `kaspanet/research` repository keeps the vProgs protocol specification as a draft (`v0.0.1 Draft`). The
`kaspanet/vprogs` repository holds running code (state, scheduler, runtime, node and ZK proving layers). Upstream
still calls vProgs an evolving runtime and a prototype: the external APIs, reorg handling during proving, settlement
fee bumping and witness serving are moving targets.

Commit activity in a repository is not evidence that vProgs is ready for mainnet.

## What HardKAS does

- `hardkas vprogs` inspects local vProgs artifacts (`capabilities`, `status`, `inspect`), without runtime claims.
- `hardkas programmability` inspects and checks local Silver, ZK and vProgs artifacts: no vProgs runtime, no on-chain
  ZK verification.
- `hardkas zk toccata` builds and checks Toccata ZK locks for RISC Zero Groth16 receipts; its `spend` sends a lock's
  spend through HardKAS's send, the node verifies the proof, and HardKAS claims no on-chain verification of its own
  (experimental).

Read on: [runtime architecture](./architecture.md) and the [ZK proving pipeline](./proving-pipeline.md).
