# Replay Invariants

The **Replay Engine** is a core pillar of HardKAS. It allows you to re-execute a transaction artifact against a baseline state to verify that the outcome is deterministic.

## The Replay Invariant

The fundamental guarantee of HardKAS is the **Replay Invariant**:

> Given an initial state **S** and a transaction artifact **A**, re-executing **A** must always result in the same final state **S'** and the same operational metadata (fees, mass, hashes).

## Why Replay?

### 1. Determinism Verification
In a distributed system like Kaspa, network latency and DAA score shifts can sometimes make outcomes feel unpredictable. Replay allows you to isolate the transaction logic from network noise.

### 2. Regression Testing
When upgrading your application or the HardKAS SDK, you can replay a corpus of "golden" artifacts to ensure that mass calculations and fee logic remain identical.

### 3. Debugging
If a transaction fails on-chain, you can export the artifact and replay it locally in a `simulated` environment to see exactly where the semantic validation failed (e.g., insufficient fee, dust output, or double spend).

## How it Works

1. **Bootstrap**: HardKAS restores the environment to the `networkId` and `daaScore` specified in the artifact.
2. **Inject**: The transaction inputs are mapped to the local UTXO set.
3. **Execute**: The transaction is processed by the HardKAS simulation logic (or a local node).
4. **Compare**: The resulting `contentHash` and state changes are compared against the artifact's record.

## Determinism CI

In a mature infrastructure, the **Determinism CI** gate verifies that artifacts produced on one platform (e.g., Linux CI) can be perfectly replayed on another (e.g., Windows dev machine). If hashes drift, the CI fails, protecting the integrity of the development flow.
