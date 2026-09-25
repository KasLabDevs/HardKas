---
title: Submission & Execution
sidebar_position: 6
---

import QualificationContext from '@site/src/components/QualificationContext';

# Submission & Execution

The final phase of the Transaction Plane is dispatching the `SignedTxArtifact` to an execution environment.

## The Execution Path

When you submit a transaction (via `hardkas tx send` or `tx.send()`), HardKAS performs final workflow validation (checking signatures and lineage) before pushing the payload to the target specified in the plan.

### Simulator Acceptance
If the environment is `simulator`, HardKAS applies the mutations directly to the local `.hardkas/localnet.json` state. It immediately generates a receipt indicating deterministic success.

### Node Mempool Acceptance
If the environment is a real Kaspa node (`simnet`, `testnet`, `mainnet`), HardKAS dispatches the serialized transaction to the node via JSON-RPC. If the node validates the consensus rules, it accepts the transaction into its mempool and returns a protocol `txId`.

## The `TxReceiptArtifact`

Regardless of the environment, a successful submission produces a `TxReceiptArtifact` stored in `.hardkas/artifacts/receipts/`.

### What it proves
A receipt proves **submission acceptance**. It serves as durable evidence that the execution target (the Simulator or the Node's RPC server) successfully accepted the payload without throwing an error.

### What it does NOT prove
A receipt does **not** prove finality or mining confirmation.
If the transaction was submitted to a live Kaspa node, the receipt merely indicates it reached the mempool. It does not guarantee that the transaction will be mined into a block, nor does it guarantee the transaction will survive a chain reorganization.

## The `txId` Domain Namespace

When a transaction is submitted to the Kaspa protocol, the network assigns it a transaction hash (`txId`).

- **`txId` is a domain identity:** It belongs to the Kaspa protocol. It is useful for looking up the transaction on a block explorer.
- **`txId` is NOT an artifact identity:** You cannot use a `txId` as a generic locator for HardKAS artifact resolution (e.g., in `hardkas explain`). The artifact resolver strictly requires the canonical `artifactId`.

*(Note: There is a known DX limitation in `hardkas tx send` where the CLI mistakenly suggests using the `txId` for `hardkas explain`. This is tracked internally as `CLI-NEXTSTEPS-1` and will be corrected, but the architectural constraint preventing generic `txId` resolution remains absolute).*

<QualificationContext capabilityId="artifacts" />
