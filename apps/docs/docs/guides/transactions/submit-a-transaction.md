---
title: How to Submit a Transaction
sidebar_position: 3
---

# How to Submit a Transaction

Once you hold a valid `SignedTxArtifact`, you must submit it to the network to effect state change.

## Basic Submission

```bash
hardkas tx send signed.json
```

HardKAS reads the target environment from the `SignedTxArtifact` (which inherited it from the plan) and routes the payload accordingly.

## Simulator vs Node Responses

- **Simulator Submission:** HardKAS mutates the local memory/JSON state and immediately returns a deterministic `TxReceiptArtifact`.
- **Real-Node Submission:** HardKAS broadcasts the transaction via JSON-RPC. If the node accepts it into the mempool, it returns a Kaspa `txId`. HardKAS wraps this event in a `TxReceiptArtifact` and writes it to disk.

## Extracting the Receipt

When you submit a transaction, the CLI prints the path to the resulting receipt:

```text
  Artifact Written
    C:\path\to\.hardkas\artifacts\receipts\txReceipt-<hash>.json
```

This file is your durable proof of submission. You can use it in queries or audits:

```bash
hardkas verify
hardkas explain .hardkas/artifacts/receipts/txReceipt-<hash>.json
```
