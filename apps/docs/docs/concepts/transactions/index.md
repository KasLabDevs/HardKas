---
title: Transactions Overview
sidebar_position: 1
---

# Transactions Overview

In HardKAS, a transaction is not a single opaque RPC call. It is a strictly structured workflow that transforms a human **Intent** into immutable cryptographically verified **Evidence**.

## The Transaction Plane

The execution of a transaction in HardKAS follows an exact sequence, governed by strict interfaces and namespace separation. This pipeline is called the **Transaction Plane**:

```text
Intent (Human or programmatic goal)
  ↓
UTXO Discovery (Finding spendable resources)
  ↓
Planning (Selection, Fee, Mass, Change)
  ↓
TxPlanArtifact (Verifiable geometric bounds)
  ↓
Signing (Authorization)
  ↓
SignedTxArtifact (Verifiable authority)
  ↓
Submission (Execution)
  ↓
TxReceiptArtifact (Verifiable network acceptance)
```

## Intent
The process begins with an **Intent**. 
*Note: There is no formal `TransactionIntent` API class in HardKAS. "Intent" is a conceptual term for the parameters passed to the CLI (`tx plan`) or the SDK (`hardkas.tx.plan()`).*

An intent typically defines:
- **Sender (`from`)**: The account or address funding the transaction.
- **Recipient (`to`)**: The destination address.
- **Amount**: The value to transfer in sompi.
- **Environment**: The target network (`simulated`, `simnet`, `mainnet`).
- **Change Address**: Where unspent input value should return (defaults to the sender if omitted).

HardKAS takes this intent and routes it through the transaction plane, ensuring safety boundaries (like maturity filtering and pending-spend protection) before the transaction is constructed.

---
**Explore the Transaction Plane:**
- [UTXO Discovery & Safety](./utxos.md)
- [Planning & Construction](./planning.md)
- [Fees & Mass](./fees-and-mass.md)
- [Signing & Authorization](./signing.md)
- [Submission & Finality](./submission.md)
