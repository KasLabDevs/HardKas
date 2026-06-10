# UTXO Management

Wallet fragmentation is a severe problem for high-throughput networks.

## Input Limits and Memory Protection

Kaspa transactions have a maximum mass (size in bytes). A single transaction cannot consume thousands of UTXOs.
Furthermore, loading 50,000 UTXOs into a Node.js V8 context will cause a memory crash.

HardKAS separates discovery from signing. The **Planner** queries the provider and uses a **Largest-First** selection strategy. It pulls only the exact number of UTXOs necessary to fund the transaction, preventing mass limit violations.

## Consolidation

If a wallet contains only dust (e.g., thousands of tiny mining rewards), a standard transaction will fail with `TOO_MANY_INPUTS_FOR_SINGLE_TX`.
The `accounts consolidate` engine uses a **Smallest-First** batching strategy. It iteratively sweeps dust into maximum-allowed-mass chunks and sends them to the wallet's own address, paying the required fees, until the wallet is defragmented.
