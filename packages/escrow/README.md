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

A configuration without `version` is a **v2** escrow. A v2 escrow in full mode (the default) has one principal. `principal`, when given, is it. Without `principal`, `refundAmount` and `releaseAmount` name it and must have the same value: different amounts are refused with `ESCROW_CONFIG_INVALID`. A legacy escrow whose refund and release amounts differ says `version: "v1"`.

## What the contracts do not enforce

The contract sources are unchanged in this release: a changed byte would change every escrow address.

- Every v2 branch pays fixed amounts (the principal, or the two allocations). The fee is what the coin holds above that. A coin worth less than the principal cannot be spent; a coin worth more pays the excess as fee. Fund exactly the principal plus the fee the tool states.
- No branch requires a single input. Two coins at one escrow address could be spent together and the second would become fee. Only the signers can build that transaction.
- There is no timeout or recovery branch. With two of the three keys lost, the coin cannot be spent.

[Limitations](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/limitations.md) has the full list and what the tool does about each one.

## Status

HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental. Mainnet is blocked by policy in this release.

## License

MIT
