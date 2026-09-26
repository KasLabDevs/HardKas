# Accounts & Identity

Welcome to the HardKAS Accounts documentation. 

Before integrating user wallets or generating cryptographic keys, you must understand how HardKAS conceptually isolates **Identity**, **Storage**, and **Authorization**.

* **[The Ontology (Accounts vs Addresses)](./accounts-and-addresses.md):** Learn why an Account is an identity context, while an Address is just network eligibility.
* **[The Authority Model](./authority-model.md):** Learn the most critical invariant in HardKAS: Receiving funds does not grant signing authority.
* **[Wallet vs Account](./wallets-vs-accounts.md):** Understand the difference between the low-level Identity layer and the high-level Toolkit orchestration layer.
* **[Security & Key Persistence](./security.md):** Understand the boundaries of HardKAS development keys and the implications of `--unsafe-plaintext`.

## The Environment Matrix

How accounts behave depends entirely on the execution environment.

| Concept | Simulator | Localnet (`simnet`) | Testnet / Mainnet |
| :--- | :--- | :--- | :--- |
| **Account Identity** | `synthetic` | `kaspa` | `kaspa` or `external-wallet` |
| **Address Prefix** | `kaspa:sim_` | `kaspasim:` | `kaspatest:` / `kaspa:` |
| **Private Key** | Non-existent (virtual) | Generated (ECDSA/Schnorr) | Stored securely or Hardware Wallet |
| **Funding Authority** | Internal Virtual State | Local CPU Miner | Public Faucet or External Funds |
| **Signing Authority** | Instant/Bypassed | Local Keystore / Plaintext | Local Keystore or PSKT Export |
| **Balance Source** | In-memory State | Local Node RPC | Remote Node RPC |

## Next Steps

To see these concepts in action, read the [Development Accounts](../../guides/accounts/development-accounts.md) and [Real Accounts](../../guides/accounts/real-account.md) guides.
