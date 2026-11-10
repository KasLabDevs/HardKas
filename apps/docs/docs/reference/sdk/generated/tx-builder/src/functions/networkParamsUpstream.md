[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / networkParamsUpstream

# Function: networkParamsUpstream()

> **networkParamsUpstream**(`networkId`): `any`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:121](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L121)

`getNetworkParams(networkId)` as the SDK returns it: coinbase and user
maturity, coinbase stasis and additional compound-transaction mass. It has no
dust or minimum-relay value. HardKAS reads maturities through
`@hardkas/core` `sdkNetworkParams` / `getCoinbaseMaturity`.

## Parameters

### networkId

`string`

## Returns

`any`
