# Wallet Optimizer - Tooling Frictions (Lab 10)

This document captures the frictions encountered when attempting to build a Wallet Optimizer application using only the existing `WalletToolkit` (v0.11.2-alpha).

Building a professional Kaspa wallet requires extensive Coin Control and UTXO optimization capabilities. The current `WalletToolkit` provides none of these, making advanced wallet management impossible without dropping down to internal low-level SDK helpers.

## Identified Frictions

### 1. No `wallet.utxos.analyze()`
There is no high-level diagnostic tool to analyze the health of the wallet's UTXO set. We are forced to manually loop through all UTXOs to calculate total balance, average UTXO size, and identify problematic distributions.

### 2. No Dust Classification
The concept of "dust" (UTXOs so small that they cost more to spend than they are worth, or marginally so) is entirely absent. Developers must guess or hardcode arbitrary thresholds (e.g., `amount < 10 KAS`) to filter dust, rather than relying on dynamic network fee calculations.

### 3. No Fragmentation Score
There is no way to tell if a wallet is heavily fragmented at a glance. We have to invent custom formulas (like `dustCount / totalUtxos`) to assign a fragmentation score, leading to inconsistent standards across applications.

### 4. No Consolidate Plan
Attempting to merge UTXOs currently requires a blind `wallet.planSend()` or `sendSimulated()` to ourselves. Since mass limits cap the number of inputs in a single transaction, consolidating 1000 UTXOs manually will fail. There is no `wallet.utxos.consolidate()` to automatically chunk the consolidations into valid transactions.

### 5. No Split / Merge / Sweep Plan
- **Split**: Breaking a massive UTXO into smaller chunks (e.g., for parallel processing) requires complex manual math to account for fees and change.
- **Merge**: Selectively combining specific UTXOs is impossible because `WalletToolkit`'s `send()` methods do not accept an explicit list of input UTXOs.
- **Sweep**: Emptying an account entirely is a tedious manual calculation of `balance - exactFee`.

### 6. No Freeze / Unfreeze
There is no way to prevent the `CoinSelector` from spending specific UTXOs (e.g., locking a UTXO that holds a specific inscription or token). The coin selection algorithm is a black box.

### 7. No Labels / Notes for UTXOs
In a professional treasury or exchange wallet, individual UTXOs often represent specific deposits or locked funds. The current toolkit provides no mechanism to tag, label, or annotate specific UTXOs.

### 8. No Projected Future Fee Cost
When holding thousands of small UTXOs, the future cost of spending them is unknown. There is no API to simulate what it would cost to consolidate the wallet at current network fee rates, forcing developers to blindly estimate or overpay.

---
**Conclusion**: To support professional Wallet/Exchange/Treasury development, the `@hardkas/toolkit` must introduce a dedicated `wallet.utxos.*` API to natively handle Coin Control and advanced UTXO management.
