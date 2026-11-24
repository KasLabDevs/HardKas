[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / excludeImmatureCoinbase

# Function: excludeImmatureCoinbase()

> **excludeImmatureCoinbase**\<`T`\>(`utxos`, `input`): `object`

Defined in: [packages/tx-builder/src/service.ts:122](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L122)

HK-10 · the maturity rule of the planners (network coinbase maturity + the 10-DAA margin), for callers that batch UTXOs
before planning (CLI `accounts consolidate`). A coinbase without a block DAA score, or any coinbase when the virtual DAA
score is unknown, is not provably mature and is excluded.

## Type Parameters

### T

`T` *extends* `object`

## Parameters

### utxos

readonly `T`[]

### input

#### networkId

`string`

#### virtualDaaScore

`bigint`

## Returns

`object`

### coinbaseMaturity

> **coinbaseMaturity**: `bigint`

### excluded

> **excluded**: `number`

### spendable

> **spendable**: `T`[]
