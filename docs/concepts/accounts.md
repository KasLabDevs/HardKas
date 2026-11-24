---
title: Accounts and Wallets
description: Where HardKAS keeps accounts and keys, and the difference between an account (identity and signing) and a wallet (balances and payments).
---

# Accounts and Wallets

HardKAS separates key storage from network addresses, and an account (an identity that can sign) from a wallet (a
stateful layer that tracks balances and makes payments). How a name such as `alice` resolves in each execution world
is in [execution worlds](./execution-worlds.md#accounts-in-each-world).

## Where accounts live

- **Simulated accounts** are in the simulated ledger, `.hardkas/localnet.json`: `hardkas init` creates alice…erin with
  1000 KAS each. Their addresses come from deterministic, public development keys and their UTXOs are synthetic; they
  exist for tests only.
- **Real accounts** are listed in `.hardkas/accounts.real.json`. Each entry points to an encrypted keystore in
  `.hardkas/keystore/` (`keystoreRef`), or holds a plaintext key when you asked for one (`--unsafe-plaintext`,
  `hardkas localnet account create`).
- **Encrypted keystores** are JSON files: the key is encrypted with AES-256-GCM under a key derived by Argon2id from
  your password, and the signer needs that password (`--password-env` or `--password-stdin`) to decrypt it.
- **HD wallets** (`hardkas wallet hd`, experimental) keep a BIP39 recovery phrase, encrypted, in `.hardkas/wallets/`.

`hardkas accounts list` shows the accounts of the current world. Keys, plaintext and export are covered in the
[security model](./security-model.md#keys-on-disk).

### Key lifecycle

Keys are loaded lazily. `hardkas tx plan` never loads a private key from disk; the key is decrypted and passed to
`kaspa-wasm` only while `hardkas tx sign` (or a send that signs) produces the signature, then released.

## Account versus wallet

People often say "account" and "wallet" for the same thing. In HardKAS they are different layers.

### The account: identity and signing

`@hardkas/accounts`, and `sdk.accounts` in the SDK (`resolve(name)`, `list()`, `balance(name)`, …). An account answers
two questions:

1. What is the Kaspa address of this identity in the current world?
2. Can HardKAS sign for it, and how?

The account layer keeps no state about money: it does not track UTXOs or balances over time. It provides the key
material (or the external signer) that satisfies a transaction's inputs. Selecting UTXOs is the planner's job.

### The wallet: balances and payments

`WalletToolkit` (`@hardkas/toolkit`), opened in the SDK with `sdk.wallet.open(name)`: that is the only member of
`sdk.wallet`. A wallet tracks state over an address and runs multi-step operations:

- **Balances and history:** `balance()`, `history()`, `watch()`;
- **Addresses and coins:** `receive()`, and `utxos` for coin control;
- **Payments:** `send()`, `payMany()`, `sweep()`, `consolidate()` and `split()`, each of which plans, signs and sends
  for you.

For example, `await sdk.wallet.open("main").balance()` gives the wallet's balance in sompi, as a `bigint`.

> [!IMPORTANT]
> A `WalletToolkit` wallet is a development facade, not custody. Its own identity is synthetic: its keys can be
> computed by anyone from the wallet's name, so it exists on simnet only and refuses every other network before an
> address exists. A spend needs the signer the SDK injects, which is a different identity from the wallet's own
> address. For funds on a public testnet, use a real account (`hardkas accounts real generate`) with
> `tx plan`, `tx sign` and `tx send`, or a recoverable `hardkas wallet hd` wallet. See the
> [SDK wallet guide](../guides/sdk-wallet.md).

### Summary

| | Account | Wallet (`WalletToolkit`) |
| :-- | :-- | :-- |
| **About** | identity and signing | balances and payments |
| **Knows its balance?** | asks when you call `balance(name)` | yes, and can watch it |
| **Selects UTXOs?** | no (the planner does) | yes, through the planner |
| **Holds a key?** | a real account does (keystore or plaintext) | no key of its own that protects funds: it signs through the injected signer |
| **Example** | `await sdk.accounts.resolve("alice")` | `await sdk.wallet.open("main").balance()` |

Calling something a wallet does not mean it holds keys safely, and an account has no balance state of its own.
