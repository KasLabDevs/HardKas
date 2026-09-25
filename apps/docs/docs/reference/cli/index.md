---
title: CLI Reference
sidebar_position: 1
---

# HardKAS CLI Reference

Welcome to the definitive structural and semantic reference for the HardKAS command-line interface.

## Map of the CLI

The CLI is organized into strict functional domains. 

- [hardkas accounts](./accounts.md)
- [hardkas artifact](./artifact.md)
- [hardkas capabilities](./capabilities.md)
- [hardkas chaos](./chaos.md)
- [hardkas ci](./ci.md)
- [hardkas config](./config.md)
- [hardkas console](./console.md)
- [hardkas corpus](./corpus.md)
- [hardkas create](./create.md)
- [hardkas dag](./dag.md)
- [hardkas deploy](./deploy.md)
- [hardkas dev](./dev.md)
- [hardkas doctor](./doctor.md)
- [hardkas env](./env.md)
- [hardkas evidence](./evidence.md)
- [hardkas explain](./explain.md)
- [hardkas init](./init.md)
- [hardkas inspect](./inspect.md)
- [hardkas kaspa](./kaspa.md)
- [hardkas local](./local.md)
- [hardkas localnet](./localnet.md)
- [hardkas lock](./lock.md)
- [hardkas node](./node.md)
- [hardkas programmability](./programmability.md)
- [hardkas pskt](./pskt.md)
- [hardkas query](./query.md)
- [hardkas rebuild](./rebuild.md)
- [hardkas repair](./repair.md)
- [hardkas replay](./replay.md)
- [hardkas rotate](./rotate.md)
- [hardkas rpc](./rpc.md)
- [hardkas run](./run.md)
- [hardkas sandbox](./sandbox.md)
- [hardkas security](./security.md)
- [hardkas session](./session.md)
- [hardkas silver](./silver.md)
- [hardkas simulator](./simulator.md)
- [hardkas status](./status.md)
- [hardkas task](./task.md)
- [hardkas telemetry](./telemetry.md)
- [hardkas test](./test.md)
- [hardkas toolchain](./toolchain.md)
- [hardkas torture](./torture.md)
- [hardkas tx](./tx.md)
- [hardkas up](./up.md)
- [hardkas verify](./verify.md)
- [hardkas verify-semantics](./verify-semantics.md)
- [hardkas vprogs](./vprogs.md)
- [hardkas why](./why.md)
- [hardkas workflow](./workflow.md)
- [hardkas zk](./zk.md)

## How to read this reference

Every command page is divided into two distinct boundaries to prevent drift:
1. **Generated Structural Reference**: Automatically extracted from the Commander AST (Arguments, Options, Defaults).
2. **Curated Semantic Metadata**: Editorial boundaries curated to explain Evidence, Side Effects, and Identity Contracts.

### Artifact Handles (Identity Contract)
When a command accepts an artifact identifier (e.g. `hardkas explain <artifact>`), you must provide either:
1. An explicit **filepath** (e.g., `./.hardkas/artifacts/plans/my-plan.json`)
2. The exact canonical **artifactId** (a 64-character hex string)

Do **not** use the network `txId` as a generic locator. It will fail. 

### Side Effect Notation
Commands that mutate your local workspace, broadcast to a network, or expose sensitive material (like private keys) are explicitly marked in the **Side Effects** semantic block. If a command does not have this block, it is considered a read-only operation.
