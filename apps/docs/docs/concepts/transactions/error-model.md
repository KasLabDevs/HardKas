---
title: Error Model
sidebar_position: 7
---

# Error Model

The Transaction Plane encounters various failure states, which HardKAS models explicitly to help developers distinguish between safety interventions, execution rejections, and geometric constraints.

## Planning Errors

- **`SELECTED_UTXO_INVALIDATED`** (`SelectedUtxoInvalidatedError`): Thrown by CLI planning against a real node when, in every bounded retry, an input the planner selected was no longer in the address UTXO set or was being spent by a transaction in the node's mempool. The DAG advancing while the plan is built is never a reason for it. Plan again once the competing transaction is accepted or dropped.
- **`TOO_MANY_INPUTS_FOR_SINGLE_TX`**: Thrown if the required inputs exceed the safe mass limit (e.g., `512` inputs). The developer should run `hardkas accounts consolidate` to merge dust UTXOs before attempting the transaction again.
- **`FeeSelectionDidNotConvergeError`**: Thrown if the legacy planner fails to find a stable UTXO selection that can cover both the principal amount and the iteratively estimated fee.
- **`Insufficient funds`**: Thrown when the available mature, unspent UTXOs (after safety filtering and pending-spend exclusions) cannot cover the requested amount plus the network fee.

## Execution Errors

- **`RPC_SCHEMA_ERROR`**: Thrown during node interaction if the connected Kaspa node returns a payload that violates the strict Zod schemas expected by HardKAS (often indicating a node version mismatch).
- **`REPLAY_MODE_UNSUPPORTED`**: Thrown if you attempt to deterministically replay a `TxReceiptArtifact` that was generated against a real Kaspa node. HardKAS safely fail-closes because it cannot locally reconstruct real network history.
