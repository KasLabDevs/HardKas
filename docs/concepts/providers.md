# Providers

Providers abstract the Kaspa network.

## Simulated Provider
The simulated provider acts as an in-memory blockchain. It reads UTXOs from a local JSON fixture and updates balances immediately upon `tx simulate`. It is deterministic, instantaneous, and used for CI/CD pipelines.

## RPC Provider
The RPC provider communicates with a `rusty-kaspad` JSON-RPC endpoint. It performs no local settlement. When you call `tx send`, it forwards the hex payload to the node. If the node accepts it, the provider waits for the transaction to be included in a block (respecting the DAA score and coinbase maturity rules) before returning a successful receipt.
