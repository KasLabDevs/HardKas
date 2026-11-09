# @hardkas/accounts

Accounts, keystores and signers: the simulated and dev accounts, the encrypted keystore and the signers that `@hardkas/cli` and `@hardkas/sdk` use.

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/accounts
```

`@hardkas/cli` and `@hardkas/sdk` depend on it; most projects never install it directly.

## What it contains

- Account resolution for a workspace (`resolveHardkasAccount`, `listHardkasAccounts`).
- The encrypted keystore (`KeystoreManager`).
- Signers over the official Kaspa WASM SDK, loaded from the managed toolchain (`hardkas toolchain install kaspa-wasm`).
- SilverScript and v1 (covenant) transaction helpers used by `hardkas silver`.

## Status

HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental. Mainnet is blocked by policy in this release.

## License

MIT
