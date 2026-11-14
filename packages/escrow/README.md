# @hardkas/escrow

Escrow records and rescue drafts.

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/escrow
```

`@hardkas/cli` and `@hardkas/dev-server` depend on it.

## What it contains

- `createEscrow` and its typed `EscrowError`.
- `escrowResolution` and `escrowSigners`.
- `escrowTermsOf`: the version, mode and principal a configuration means, the same reading `createEscrow` and `escrowResolution` use.
- The escrow record types and sources.

## Versions

A configuration without `version` is a **v2** escrow. A v2 escrow in full mode (the default) has one principal: give `principal`, or `refundAmount` and `releaseAmount` with the same value. Different amounts are refused with `ESCROW_CONFIG_INVALID`. A legacy escrow whose refund and release amounts differ says `version: "v1"`.

## Status

HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental. Mainnet is blocked by policy in this release.

## License

MIT
