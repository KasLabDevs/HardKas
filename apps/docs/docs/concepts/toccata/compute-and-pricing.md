# Compute Budget & Script Pricing

> **L1 Status:** ACTIVE CONSENSUS

With Toccata (KIP-25), Kaspa introduces a precise computational pricing model, replacing the legacy `sig_op_count`.

## Terminology Breakdown

Do not describe Kaspa compute generically as "gas". Kaspa is a UTXO network, not an account-based EVM. The components are distinct:

1. **Compute Budget:** A field in the v1 Transaction declaring the maximum computational resources this transaction is allowed to consume during script evaluation.
2. **Script Units:** The actual cost of executing specific Kaspa Script opcodes (e.g., verifying a signature, hashing data, or executing `OpZkPrecompile`).
3. **Mass:** The overall physical footprint of the transaction in the block (bytes). Compute budget is now factored into the total mass calculation.
4. **Fee (Sompi):** The network token paid to the miner to incentivize inclusion in the block.

## Consensus vs Mempool Policy

> **Canonical Warning:** Fee policy is not consensus validity.

* **Consensus Validity:** If a transaction executes a script that requires more Script Units than the declared `compute_budget`, the transaction is strictly invalid and will be rejected by consensus.
* **Mempool Policy:** A node's mempool may require a specific ratio of Fee to Mass (and by extension, Fee to Compute Budget) to accept the transaction for relay. This ratio is a local node policy, not a consensus rule.

## HardKAS Integration

When interacting with Covenants via HardKAS, the framework separates planning from execution:

```bash
hardkas silver covenant genesis ... --compute-budget 50000 --fee 200000000
```
*Because the SDK currently lacks a deterministic script-unit estimator for complex covenant paths, you must often specify the `compute_budget` explicitly when using HardKAS CLI.*

