# ZK Primitives & Sequencing

> **L1 Status:** ACTIVE CONSENSUS (`OpZkPrecompile` / KIP-16) | **HardKAS Tooling:** Groth16 Math Verification & Toccata Script Builders

While Covenants allow L1 state machines, computationally intensive applications (such as privacy pools, batch rollups, or order books) require off-chain execution paired with Layer 1 verification and settlement.

Toccata introduces the foundational primitives required to verify Zero-Knowledge proofs and anchor sequencing commitments directly on Kaspa L1.

---

## 1. `OpZkPrecompile` (`0xa8` / KIP-16)

Toccata introduces `OpZkPrecompile` (`0xa8`), a native Kaspa Script opcode that verifies Zero-Knowledge proofs directly during UTXO script validation.

| Parameter | Canonical Value | Description |
| :--- | :--- | :--- |
| **Opcode** | `0xa8` (`OpZkPrecompile`) | Evaluates a tagged ZK proof payload from the script stack |
| **Tag `0x20`** | `R0Groth16` | RISC Zero Groth16 proof envelope over BN254 |
| **Base SigOp Cost** | `150` | Consensus signature-operation weight per precompile invocation |
| **Compute Gram Cost** | `75,000` | Explicit Toccata v1 compute budget allocation required |

You can inspect these exact protocol constants at any time via the CLI:

```bash
hardkas zk toccata rules --json
```

---

## 2. Sequencer Commitments & User Lanes (KIP-21)

To build a high-throughput off-chain application, the application must order its state transitions and commit to that ordering on L1.

KIP-21 introduces partitioned sequencing commitments. Standard v1 transactions can carry structured lane commitments (User Lanes) in their payload or covenant scripts, localizing state transitions to a deterministic lineage without global state contention.

> **Note:** A "lane" is not an independent blockchain or EVM sidechain. It is a deterministic partition of state commitments anchored inside standard Kaspa L1 UTXO transactions.

---

## 3. HardKAS ZK Tooling (`hardkas zk` & `@hardkas/sdk`)

HardKAS provides three layers of Zero-Knowledge tooling for Kaspa L1 developers:

1. **Fixture Coherence & Corpus Auditing (`hardkas zk proof inspect` / `verify` / `corpus verify`):**
   Validates schema integrity, canonical SHA-256 domain digests, and public input bindings across local proof corpora (`fixtures/toccata-v2/zk`).
2. **Cryptographic Groth16 Pairing Verification (`hardkas zk proof verify-math`):**
   Executes real BN254 elliptic-curve pairing verification (`snarkjs`), enforces domain-separated verification key hashes (`--expect-vk-hash`), and automatically rejects degenerate/trapdoor verification keys (such as `[1]_2` delta/gamma points) unless `--allow-weak-vk` is explicitly passed for toy fixtures.
3. **Toccata L1 Covenant Script Generation (`hardkas zk toccata build-scripts`):**
   Uses `kaspa-wasm`'s `ZkScriptBuilder` to construct canonical P2SH redeem scripts and signature scripts for RISC Zero Groth16 receipts (`imageId`, `journalHash`, `receiptHex`).

See the step-by-step developer walkthrough: **[ZK L1 Verification & Covenant Scripts Guide](../../guides/zk-l1-verification-and-settlement.md)**.
