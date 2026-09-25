# Covenant IDs

> **L1 Status:** ACTIVE CONSENSUS

If a P2SH covenant changes its address every time its state evolves, how do wallets and indexers track it? 

The answer is the **Covenant ID** (KIP-20).

## What is a Covenant ID?

A `covenant_id` is a 32-byte, consensus-tracked identifier. It serves as the stable identity of a covenant "family" or lineage across infinite UTXO state transitions.

> **Canonical Invariant:** `covenant_id` is not the identity of the specific state. It is the stable identity of the lineage. The UTXO and its script represent the concrete instance of that state.

## Genesis & Continuation

1. **Genesis Initialization:** When a covenant is first deployed (Genesis), the protocol derives a mathematically unique `covenant_id` (typically based on the Outpoint of the funding UTXO). This guarantees non-forgeability; no two covenants can ever share the same genesis ID.
2. **Continuation:** When the covenant UTXO is spent, the spending transaction uses an **Output Covenant Binding** to explicitly assign the same `covenant_id` to the successor output.
3. **Validation:** The Kaspa node enforces at consensus that the `covenant_id` was legitimately inherited. You cannot arbitrarily assign an existing `covenant_id` to a random output.

## Identity Namespaces

HardKAS orchestration deals with many types of IDs. Do not mix them up:

| Identifier | Scope | Purpose |
| :--- | :--- | :--- |
| **`covenant_id`** | Consensus (L1) | Stable identity of a covenant lineage over time. |
| **Outpoint** | Consensus (L1) | The specific UTXO (State instance) currently holding the covenant. |
| **Address (P2SH)** | Network | The hash of the current state script. Changes on transition. |
| **`txid`** | Consensus (L1) | The transaction that executed a transition. |
| **`artifactId`** | HardKAS | The local developer tracking ID of your deployment intent. |

Never allow a HardKAS `artifactId` to be confused with an L1 `covenant_id`.

