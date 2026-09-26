# Runtime Architecture

> **vProgs Status:** ACTIVE DEVELOPMENT / PROTOTYPE

The vProgs reference implementation (`kaspanet/vprogs`) is structured into distinct layers. This layered approach ensures that execution, state management, and proving are decoupled.

## The Layered Model

The current implementation exposes the following core boundaries:

1. **`core`**: Base types, traits, and cryptographic primitives.
2. **`storage`**: Local persistence for the vProgs node. *Note: This is local node storage, not decentralized L1 state storage.*
3. **`state`**: Manages versioned application state, state roots, diffs, and check-pointing. A vProgs state root is distinct from Kaspa's UTXO state.
4. **`scheduling`**: Orchestrates transaction batching, parallel execution, and resource access determinism. 
5. **`transaction-runtime`**: The execution context where the Reference VM runs the verifiable program.
6. **`node`**: The orchestration daemon that tracks L1 notifications and orchestrates the scheduler.

*Auxiliary domains:*
* **`zk`**: The proving pipeline (transaction proofs, batch proofs, aggregation, RISC Zero integration).
* **`l1`**: Translates L1 DAG activity into vProgs inputs (deposits, lane sequencing).

## What Does "Based" Mean?

vProgs is a **based** computation architecture. This term should be used precisely, not as branding.

In vProgs, "based" means **the application derives its sequencing from Kaspa's consensus-committed transaction order (KIP-21).**
* Kaspa L1 does not run a sequencer for the application.
* Kaspa L1 does not execute the application.
* The application observes Kaspa's partitioned sequencing commitments (Lanes) to establish an immutable, L1-derived order of inputs, which the off-chain runtime then processes deterministically.

## Data Availability vs Sequencing

Kaspa provides sequencing commitments and ordering properties. It does not automatically provide full application Data Availability (DA) in the same way an Ethereum blob does.

If a vProgs application settles a proof on L1, it proves that the state transitioned correctly from Root A to Root B. However, for external users to independently reconstruct the state or generate future proofs, they must rely on **Witness Servers** or off-chain data availability solutions to retrieve the actual transaction/witness data that caused the transition.
