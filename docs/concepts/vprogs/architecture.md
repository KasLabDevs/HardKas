---
title: vProgs Runtime Architecture
description: The layers of the upstream vProgs reference implementation, what "based" means, and why sequencing is not data availability.
---

# vProgs Runtime Architecture

> [!NOTE]
> This page describes the upstream reference implementation (`kaspanet/vprogs`), a prototype in active development.
> HardKAS has no vProgs runtime; `hardkas vprogs` only inspects local artifacts.

The vProgs reference implementation is split into layers, so that execution, state management and proving stay
decoupled.

## The layers

1. **`core`:** base types, traits and cryptographic primitives.
2. **`storage`:** local persistence for the vProgs node. This is the node's own storage, not state stored on L1.
3. **`state`:** versioned application state: state roots, diffs and checkpoints. A vProgs state root is distinct from
   Kaspa's UTXO set.
4. **`scheduling`:** transaction batching, parallel execution and deterministic resource access.
5. **`transaction-runtime`:** where the reference VM runs the verifiable program.
6. **`node`:** the daemon that follows L1 notifications and drives the scheduler.

Two auxiliary domains:

- **`zk`:** the proving pipeline (transaction proofs, batch proofs, aggregation, RISC Zero integration). See the
  [ZK proving pipeline](./proving-pipeline.md).
- **`l1`:** turns L1 DAG activity into vProgs inputs (deposits, lane sequencing).

## What "based" means

vProgs is a **based** architecture. Use the word precisely, not as branding: the application takes its sequencing
from Kaspa's consensus-committed transaction order (KIP-21).

- Kaspa L1 runs no sequencer for the application.
- Kaspa L1 does not execute the application.
- The application reads Kaspa's partitioned sequencing commitments (lanes) to get an L1-derived order of inputs, which
  the off-chain runtime then processes deterministically.

## Data availability versus sequencing

Kaspa provides sequencing commitments and ordering. It does not by itself provide full application data availability
(DA), the way an Ethereum blob does.

When a vProgs application settles a proof on L1, the proof shows that the state moved correctly from root A to root B.
For others to rebuild that state or produce later proofs, they still need the transaction and witness data behind the
transition, from **witness servers** or another off-chain data-availability solution.
