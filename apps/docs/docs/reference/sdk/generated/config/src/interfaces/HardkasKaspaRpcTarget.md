[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / HardkasKaspaRpcTarget

# Interface: HardkasKaspaRpcTarget

Defined in: [packages/config/src/types.ts:41](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L41)

## Properties

### consensusParams?

> `optional` **consensusParams?**: `object`

Defined in: [packages/config/src/types.ts:46](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L46)

#### coinbaseMaturity?

> `optional` **coinbaseMaturity?**: `number` \| `bigint`

***

### description?

> `optional` **description?**: `string`

Defined in: [packages/config/src/types.ts:45](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L45)

***

### kind

> **kind**: `"kaspa-rpc"`

Defined in: [packages/config/src/types.ts:42](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L42)

***

### maxFeeRate?

> `optional` **maxFeeRate?**: `string` \| `number` \| `bigint`

Defined in: [packages/config/src/types.ts:52](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L52)

HK-09 / CA-TX-01: the highest fee RATE (sompi per gram) accepted from this network's node estimate; above it the plan is refused (FEE_RATE_ABOVE_BOUND).

***

### maxFeeSompi?

> `optional` **maxFeeSompi?**: `string` \| `number` \| `bigint`

Defined in: [packages/config/src/types.ts:50](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L50)

TX-FEE-GUARD-1: workspace limit on the TOTAL fee (sompi) of a transaction on this network, checked at plan, sign and send.

***

### network

> **network**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"devnet"`

Defined in: [packages/config/src/types.ts:43](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L43)

***

### rpcUrl

> **rpcUrl**: `string`

Defined in: [packages/config/src/types.ts:44](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L44)
