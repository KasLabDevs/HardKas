# The HardKAS Mental Model

Before writing any code, it is essential to understand the architectural philosophy of HardKAS. It completely flips the traditional testnet-based development paradigm.

## 1. Local-First Over Testnet

Traditionally, Web3 development relies heavily on remote testnets. This introduces ambient noise: network latency, RPC unreliability, block times, and faucet dependency.
HardKAS enforces a **Local-First Model**. You execute your transactions against a simulated, offline network (`.hardkas/localnet.json`). If the logic is sound and the cryptographic signatures are deterministic, the workflow is mathematically guaranteed to be reproducible when later broadcasted to a live network.

## 2. Deterministic Artifacts

In HardKAS, everything is an **Artifact**. An artifact is an immutable JSON document representing a specific state transition (e.g., a planned transaction, a signed transaction, a receipt).
Every artifact has a `contentHash`, which is its unique cryptographic identity.
Because artifacts are strictly deterministic—down to canonical JSON sorting and Unicode normalization—the exact same inputs will produce the exact same `contentHash` on Windows, Linux, and macOS.

## 3. The Workspace is the Ledger

Your `.hardkas/` directory acts as an offline ledger. It contains the raw artifacts, the deterministic event history (`events.jsonl`), and any local simulated state. This means your CI pipelines can cache the workspace, perform regressions, and verify logic without ever needing external network consensus.

## 4. Zero-Trust Architecture

You should never blindly trust metadata. When an artifact is loaded (e.g., from disk into memory, or passed via an API), the HardKAS SDK performs a **Zero-Trust Validation**. It dynamically calculates the canonical hash of the raw payload to ensure it matches the stated `contentHash`. Any tampering instantly rejects the artifact.
