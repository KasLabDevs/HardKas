[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / FundDevWalletsOptions

# Interface: FundDevWalletsOptions

Defined in: [packages/sdk/src/node.ts:310](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/node.ts#L310)

## Properties

### coinbaseMaturity?

> `readonly` `optional` **coinbaseMaturity?**: `bigint`

Defined in: [packages/sdk/src/node.ts:314](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/node.ts#L314)

Coinbase maturity period in DAA blocks. Defaults to 1000.

***

### timeoutMs?

> `readonly` `optional` **timeoutMs?**: `number`

Defined in: [packages/sdk/src/node.ts:312](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/node.ts#L312)

Maximum time to wait for mature UTXOs in milliseconds. Defaults to 180_000 (3 minutes).
