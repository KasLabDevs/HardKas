[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / FundDevWalletsOptions

# Interface: FundDevWalletsOptions

Defined in: [packages/sdk/src/node.ts:311](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/node.ts#L311)

## Properties

### coinbaseMaturity?

> `readonly` `optional` **coinbaseMaturity?**: `bigint`

Defined in: [packages/sdk/src/node.ts:315](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/node.ts#L315)

Coinbase maturity period in DAA blocks. Defaults to 1000.

***

### timeoutMs?

> `readonly` `optional` **timeoutMs?**: `number`

Defined in: [packages/sdk/src/node.ts:313](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/node.ts#L313)

Maximum time to wait for mature UTXOs in milliseconds. Defaults to 180_000 (3 minutes).
