[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / excludeImmatureCoinbase

# Function: excludeImmatureCoinbase()

> **excludeImmatureCoinbase**\<`T`\>(`utxos`, `input`): `object`

Defined in: [packages/tx-builder/src/service.ts:121](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L121)

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
