---
title: Error Model
sidebar_position: 7
---

# Error Model

The Transaction Plane encounters various failure states, which HardKAS models explicitly to help developers distinguish between safety interventions, execution rejections, and geometric constraints.

## Planning Errors

- **`SELECTED_UTXO_INVALIDATED`** (`SelectedUtxoInvalidatedError`): Thrown by CLI planning against a real node when, in every bounded retry, an input the planner selected was no longer in the address UTXO set or was being spent by a transaction in the node's mempool. The DAG advancing while the plan is built is never a reason for it. Plan again once the competing transaction is accepted or dropped.
- **`MULTI_TRANSACTION_PLAN_REQUIRED`**: Thrown when the inputs needed do not fit in one standard transaction (the Generator would build several). Run `hardkas accounts consolidate` to merge small UTXOs, then plan again; a consolidation that hits it needs smaller batches.
- **`CHANGE_BELOW_STANDARD_OUTPUT`**: Thrown when the change the payment would leave is too small for a standard output (storage mass, KIP-9). Adjust the amount, or send the whole balance.
- **`OUTPUT_BELOW_STANDARD_AMOUNT`**: Thrown when a payment output is too small for a standard output from the selected UTXOs. Send a larger amount.
- **`Insufficient funds`**: Thrown when the available mature, unspent UTXOs (after safety filtering and pending-spend exclusions) cannot cover the requested amount plus the network fee.

## Execution Errors

- **`RPC_SCHEMA_ERROR`**: Thrown during node interaction if the connected Kaspa node returns a payload that violates the strict Zod schemas expected by HardKAS (often indicating a node version mismatch).
- **`REPLAY_MODE_UNSUPPORTED`**: Thrown if you attempt to deterministically replay a `TxReceiptArtifact` that was generated against a real Kaspa node. HardKAS safely fail-closes because it cannot locally reconstruct real network history.
