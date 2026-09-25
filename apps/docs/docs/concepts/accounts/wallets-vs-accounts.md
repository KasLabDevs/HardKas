# Wallet vs Account

In colloquial blockchain terminology, "Account" and "Wallet" are often used interchangeably. In the HardKAS architecture, they are distinct layers.

## The Account (Identity Layer)

Found in `@hardkas/accounts` and `sdk.accounts`.

An **Account** represents an *Identity Context*. It is a low-level primitive that answers two questions:
1. What is the Kaspa Address for this identity on the current network?
2. Do I possess the cryptographic Signing Authority for this identity?

The Account layer is stateless. It does not know your balance. It does not know what UTXOs you own. It only provides the cryptographic material required to satisfy a transaction's input scripts.

## The Wallet (Orchestration Layer)

Found in `@hardkas/toolkit` and `sdk.wallet`.

A **Wallet** is a higher-level stateful orchestrator. 

It wraps an Account and adds:
* **Balance Tracking:** It queries the network or local Query Store to calculate your available and pending balances.
* **UTXO Aggregation:** It tracks exactly which UTXOs are spendable, ignoring those currently locked in the mempool.
* **Multi-step Operations:** A Wallet exposes methods like `wallet.payInvoice(invoiceId)` or `wallet.consolidateDust()`, which internally orchestrate the `plan -> sign -> send` lifecycle in a single convenient call.

### Summary

| Feature | Account | Wallet |
| :--- | :--- | :--- |
| **Domain** | Cryptography & Identity | State & Payments |
| **Knows Balance?** | No | Yes |
| **Selects UTXOs?** | No (Planner does this) | Yes (via Planner) |
| **Holds Key Material?** | Yes | Yes (by wrapping an Account) |
| **Example API** | `sdk.accounts.resolve('alice')` | `sdk.wallet.getBalance()` |

Never infer that naming something a "Wallet" implies it holds keys securely, nor that an "Account" has state. HardKAS strictly isolates these responsibilities.
