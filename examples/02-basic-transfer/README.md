# Example 02: Basic Transfer

This example demonstrates the complete lifecycle of a Kaspa Layer 1 transaction using the HardKAS SDK.

## What it demonstrates

1.  **Identity Resolution**: Loading deterministic accounts (`alice`, `bob`) by name.
2.  **Balance Querying**: Fetching real-time balances from the network.
3.  **Explicit Workflow**:
    -   **Planning**: Building a `TxPlanArtifact` with UTXO selection and fee estimation.
    -   **Signing**: Creating a `SignedTxArtifact` using a local signer.
    -   **Sending**: Broadcasting the transaction to the network and receiving a `TxReceiptArtifact`.
    -   **Confirming**: Polling the network until the transaction is accepted by the blockDAG.
4.  **Artifact Persistence**: Automatic storage of receipts in `.hardkas/receipts/`.

## Prerequisites

-   A running Kaspa node (kaspad) with JSON-RPC enabled on `ws://127.0.0.1:18210`.
-   The node should have some UTXOs for the `alice` address (simulated/localnet).

## How to run

From the root of the monorepo:

```bash
pnpm example:transfer
```

## Expected Output

You should see a "Sexy" terminal UI showing the progress of each step:

```text
╔══════════════════════════════╗
║         HardKAS              ║
║      Basic Transfer          ║
╚══════════════════════════════╝

Profiles:
  Sender:    alice (kaspa:sim_alice)
  Recipient: bob (kaspa:sim_bob)

[1/4] Planning: 10 KAS -> Bob
  ✔ Plan built (ID: 8a2b1c...)
  ...
```
