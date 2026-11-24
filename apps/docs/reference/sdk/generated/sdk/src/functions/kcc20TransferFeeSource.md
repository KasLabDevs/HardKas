[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / kcc20TransferFeeSource

# Function: kcc20TransferFeeSource()

> **kcc20TransferFeeSource**(`args`): `object`

Defined in: [packages/sdk/src/kcc20.ts:197](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L197)

## Parameters

### args

#### changeIndex

`number`

The index of the sender's token change output in `recipients`, or -1 when the transfer returns none.

#### from?

`string`

The sender (`from`), when the transfer names one.

#### funder?

`string`

#### recipients

readonly `object`[]

The new token outputs, in output order (recipients, then the sender's change when there is one).

## Returns

`object`

### funder?

> `readonly` `optional` **funder?**: `string`

### restAt

> `readonly` **restAt**: `number`

### source

> `readonly` **source**: [`Kcc20FeeSource`](../type-aliases/Kcc20FeeSource.md)
