# UTXO Management

Wallet fragmentation is a severe problem for high-throughput networks.

## Input Limits and Memory Protection
Kaspa transactions have a maximum mass (size in bytes). A single transaction cannot consume thousands of UTXOs. 
Furthermore, loading 50,000 UTXOs into a Node.js V8 context will cause a memory crash.

HardKAS separates discovery from signing. The **Planner** queries the provider and hands the UTXOs to the official `kaspa-wasm` Generator, which pulls only the UTXOs needed to fund the transaction, in the order the provider lists them.

## Consolidation
If a wallet contains only dust (e.g., thousands of tiny mining rewards), a payment that needs more UTXOs than one standard transaction holds fails with `MULTI_TRANSACTION_PLAN_REQUIRED`. 
The `accounts consolidate` engine uses a **Smallest-First** batching strategy. It iteratively sweeps dust into maximum-allowed-mass chunks and sends them to the wallet's own address, paying the required fees, until the wallet is defragmented.
