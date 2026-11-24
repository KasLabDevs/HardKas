[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / WalletWatchMaturityEvent

# Interface: WalletWatchMaturityEvent

Defined in: packages/toolkit/dist/watch.d.ts:57

WATCH-CLI-1 · `maturity`: outputs the watch reported as received became mature (kaspa-wasm's `maturity` record of an
incoming transaction). Reported only by watchAddress (reportMaturity); WalletToolkit.watch() never emits it.

## Properties

### details

> **details**: `object`

Defined in: packages/toolkit/dist/watch.d.ts:60

#### matured

> **matured**: `WalletOutpoint`[]

***

### txid

> **txid**: `string`

Defined in: packages/toolkit/dist/watch.d.ts:59

***

### type

> **type**: `"maturity"`

Defined in: packages/toolkit/dist/watch.d.ts:58
