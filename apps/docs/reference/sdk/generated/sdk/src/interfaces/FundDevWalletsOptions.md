[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / FundDevWalletsOptions

# Interface: FundDevWalletsOptions

Defined in: [packages/sdk/src/node.ts:326](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/node.ts#L326)

## Properties

### coinbaseMaturity?

> `readonly` `optional` **coinbaseMaturity?**: `bigint`

Defined in: [packages/sdk/src/node.ts:330](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/node.ts#L330)

Coinbase maturity period in DAA blocks. Defaults to 1000.

***

### timeoutMs?

> `readonly` `optional` **timeoutMs?**: `number`

Defined in: [packages/sdk/src/node.ts:328](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/node.ts#L328)

Maximum time to wait for mature UTXOs in milliseconds. Defaults to 180_000 (3 minutes).
