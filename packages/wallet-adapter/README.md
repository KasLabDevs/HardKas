# @hardkas/wallet-adapter

The boundary between HardKAS and external Kaspa wallets.

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
