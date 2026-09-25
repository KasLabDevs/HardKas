# Deterministic Development Accounts

When you run `hardkas init`, HardKAS automatically populates your `.hardkas/localnet.json` with five default accounts: `alice`, `bob`, `carol`, `dave`, and `erin`.

These are **Deterministic Development Accounts**. They are designed to eliminate friction during local Simulator testing.

## How They Work

The names `alice`, `bob`, `carol`, `dave`, and `erin` are **environment-dependent aliases**. Their cryptographic properties derive strictly from the current Execution Contract, not from the name itself.

* **In the Simulator (`mode: "simulator"`):** The alias `"alice"` resolves to a **Synthetic Account**. It uses a synthetic identifier (`kaspa:sim_alice`), bypasses ECDSA/Schnorr cryptography entirely, and relies on internal virtual state.
* **On Localnet (`network: "simnet"`):** If you run `hardkas accounts real generate`, `"alice"` resolves to a **Real Dev Account** with an actual Kaspa Private Key (ECDSA/Schnorr) and a valid `kaspasim:` address.

## Why Are They Deterministic?

When generating the actual keypairs for Localnet, HardKAS uses a deterministic seed for these default aliases. This guarantees that workflow tests passing on your machine will produce identical addresses in CI.

## The Security Boundary (DEF27)

> **Canonical Rule:** Deterministic development identity is a testing convenience, not a production custody mechanism.

Because the underlying seeds for Localnet generation are hardcoded in the framework, **any keys generated for `"alice"` or `"bob"` are globally known**. If you attempt to use them on Mainnet, the funds will be immediately swept by bots. 

To use HardKAS on Testnet or Mainnet safely, you must either generate fresh, encrypted accounts with unique entropy, or defer signing authority to a true custody system via PSKT.
