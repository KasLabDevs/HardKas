[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / selectCoins

# ~~Function: selectCoins()~~

> **selectCoins**(`request`): [`CoinSelectionResult`](../interfaces/CoinSelectionResult.md)

Defined in: [packages/tx-builder/src/coin-selector.ts:65](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L65)

## Parameters

### request

[`CoinSelectionRequest`](../interfaces/CoinSelectionRequest.md)

## Returns

[`CoinSelectionResult`](../interfaces/CoinSelectionResult.md)

## Deprecated

Since M10-B. `selectCoins` is a HardKAS-invented largest-first
selector that diverges from the upstream `Generator` in `kaspa-wasm` 2.0.1
(M9 audit: PUBLIC RELEASE + TESTNET blocker). Use
[buildTransactions](buildTransactions.md) from `kaspa-wallet-adapter.ts` instead, which
yields upstream `PendingTransaction`s with authoritative fee/mass/coin
selection semantics.

This function will continue to work through M10 for backward compatibility
but SHOULD NOT be used in new code. It is expected to be deleted once every
consumer migrates.
