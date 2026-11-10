# @hardkas/wallet-adapter

The boundary between HardKAS and external Kaspa wallets.

**Not published in this release.** `@hardkas/wallet-adapter` is a private workspace package: no published HardKAS package depends on it, so this release puts no version of it on npm and the install command below does not fetch this version. Inside the HardKAS monorepo it stays a workspace package. See [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md#not-published) ("Not published").

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/wallet-adapter
```

A standalone library: nothing else in HardKAS depends on it.

## What it contains

- `detectKaspaWallets` and `connectKaspaWallet`.
- Providers: in-memory, watch-only and dev accounts.

## Status

Experimental (external wallet integrations). HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental. Mainnet is blocked by policy in this release.

## License

MIT
