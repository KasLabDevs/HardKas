# HardKAS Deterministic Guarantees & Boundaries

This document defines the strict cryptographic determinism guarantees of HardKAS and establishes the boundaries of what is explicitly out of scope.

---

## 1. What HardKAS Cryptographically Guarantees

* **Plan Identity**: Identical transaction requests on identical balance states produce identical selected inputs, outputs, and plan hashes.
* **RPC Order Immunity**: Shuffling candidate UTXOs returned by RPC queries has **zero impact** on the resulting transaction plan.
* **Equal-Value UTXO Tie-Breaking**: Identical-value inputs are sorted canonically using outpoint lexicographical ordering (`transactionId ASC -> index ASC`), removing dependencies on natural array iteration order.
* **Serialization Stability**: Standardized canonical JSON stringification (v3) enforces strict UTF-8 NFC normalization and LF newline translation.
* **Exclusion Stability**: Volatile networking fields (latency, hosts, dates) are systematically skipped, guaranteeing identical hashes across multiple host computers.
* **Virtual DAG Time-Travel**: Reconstructing block states at a target DAA score is deterministic and pure.

---

## 2. What HardKAS DOES NOT Guarantee (Critical Boundaries)

To prevent security misalignments, contributors and operators must understand what is outside the system's boundary:

* **Live Network Consensus Validity**: HardKAS does not prove that a live mainnet/testnet node will accept the planned transaction. Live consensus acceptance is dynamic and outside our local sandbox control.
* **Network Broadcast and Finality**: Planning is a local action. Successful simulation does not represent broadcast success or mining inclusion on public subnets.
* **RPC Truthfulness**: If a live node returned pruned, falsified, or out-of-date UTXO data, HardKAS plans based on those inputs.
* **Private Key Security / HSM Integrity**: HardKAS plans transactions but does not manage secure HSMs or verify signature derivation entropy safety.
* **Mempool Concurrency Safety**: HardKAS is local-first; it cannot guarantee that a planned UTXO won't be spent by another node concurrently on the live network.
* **Trustless Distributed Security**: HardKAS assumes workstation security. It does not replicate consensus protocols or enforce distributed Byzantine fault tolerance.
