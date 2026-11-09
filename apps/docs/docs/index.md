---
title: HardKAS
sidebar_label: Introduction
sidebar_position: 1
---

# HardKAS: Execution-safe development for Kaspa L1

HardKAS is a deterministic, local-first developer operating system and framework for building native **Kaspa Layer 1** applications, SilverScript smart contracts, covenants, and Zero-Knowledge verification workflows.

It provides developers with a reproducible CLI, unified TypeScript SDK (`@hardkas/sdk`), three execution worlds (`simulator`, `localnet` on real `kaspad --simnet`, and `testnet`), and an immutable artifact engine to replace the traditional "request-and-hope" blockchain development cycle with strict cryptographic accountability.

## Key Capabilities

- **Three Execution Worlds:** Build and test instantly against the deterministic in-memory simulator, boot a real `rusty-kaspa` (`kaspad --simnet`) node for consensus validation, or connect to public testnets.
- **SilverScript & Covenants (`silverc v1.0.0`):** Compile `.sil` contracts with byte-for-byte provenance, deploy P2SH outputs, and execute 1:1 auth-bound covenant genesis and state transitions.
- **ZK L1 Verification & Toccata Scripts (`OpZkPrecompile`):** Verify Groth16 BN254 proofs mathematically (`hardkas zk proof verify-math`), reject weak trapdoor verification keys, and construct canonical Toccata L1 redeem/signature scripts (`hardkas zk toccata build-scripts`).
- **Evidence-Driven Artifacts:** Every transaction plan, PSKT session, signature, and receipt is materialized as a content-addressed artifact on disk (`TxPlan` → `SignedTx` → `TxReceipt`), forming an auditable Evidence DAG.
- **Backend toolkit (alpha):** build indexers and merchant checkouts with `@hardkas/toolkit` and `@hardkas/query-store`.

## Get Started

&rarr; [Installation](./getting-started/installation.md)  
&rarr; [5-Minute Quickstart](./getting-started/quickstart.md)  
&rarr; [Examples & Builder Labs (11 Reference Apps)](./tutorials/builder-labs.md)

## Smart Contracts, Covenants & ZK

&rarr; [What is SilverScript?](./concepts/silverscript/what-is-silverscript.md)  
&rarr; [Testing Kaspa Covenants](./guides/testing-kaspa-covenants.md)  
&rarr; [ZK L1 Proof Verification & Toccata Scripts](./guides/zk-l1-verification-and-settlement.md)

## Architecture & Reference

&rarr; [What is HardKAS?](./concepts/what-is-hardkas.md)  
&rarr; [Architecture & Dependency Graph](./reference/architecture.md)  
&rarr; [Package Map](./reference/packages.md)  
&rarr; [CLI Reference](./reference/cli/index.md)
