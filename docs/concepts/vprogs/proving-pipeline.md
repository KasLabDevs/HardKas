---
title: The vProgs ZK Proving Pipeline
description: How the upstream vProgs prototype batches and aggregates ZK proofs before L1 settlement, and the statement-binding question every proof raises.
---

# The vProgs ZK Proving Pipeline

> [!NOTE]
> This page describes the upstream vProgs prototype (`kaspanet/vprogs`). The Toccata primitives it settles with are
> active in Kaspa consensus. HardKAS runs no vProgs proving and claims no on-chain ZK verification of its own.

The `zk` module of the vProgs repository defines a multi-stage proving pipeline. A ZK proof per application
transaction, checked one by one on L1, would be far too expensive, so vProgs batches and aggregates.

## Pipeline stages

```text
off-chain execution
  -> transaction proof (receipt)
  -> batch proof
  -> aggregate proof
  -> settlement journal
  -> L1 settlement transaction (OpZkPrecompile)
```

1. **Transaction proof:** a proof (for example with RISC Zero) that one application transaction executed correctly,
   taking the state from `root_pre` to `root_post`.
2. **Batch proof:** combines the transaction proofs of a lane into one proof of the whole sequence.
3. **Aggregate proof:** recursively aggregates batch proofs into one final, compact validity proof.
4. **Settlement journal:** the public inputs the final proof outputs, which the L1 settlement transaction binds to.

## Which statement does a proof prove?

> A valid proof of *exactly which statement*?

A ZK proof shows that a computation was executed correctly. It does not by itself show that the computation was the
one your application and state needed.

The **proof statement identity** is the exact set of values (image ids, covenant ids, lane keys, sequencing
commitments, state roots) that binds a proof to its context. If a cache key or a verifier leaves one of them out, a
valid proof of another statement can be accepted. In September 2026 the upstream repository had open issues of this
kind (proof receipt caching, statement binding), which is one more reason why proving code in a repository is not
evidence that it is ready for use with value.

## Asynchronous latency

Proof generation is heavy and asynchronous:

- the application's execution can advance in the `transaction-runtime` at once;
- the ZK proof is generated in the background;
- L1 settlement happens only after aggregation.

The application therefore runs with pending settlements. If an L1 reorg happens before a settlement is confirmed, the
vProgs node must roll back its pending execution state.
