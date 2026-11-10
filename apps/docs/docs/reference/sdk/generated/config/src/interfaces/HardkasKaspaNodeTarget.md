[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / HardkasKaspaNodeTarget

# Interface: HardkasKaspaNodeTarget

Defined in: [packages/config/src/types.ts:25](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L25)

## Properties

### binaryPath?

> `optional` **binaryPath?**: `string`

Defined in: [packages/config/src/types.ts:30](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L30)

***

### consensusParams?

> `optional` **consensusParams?**: `object`

Defined in: [packages/config/src/types.ts:32](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L32)

#### coinbaseMaturity?

> `optional` **coinbaseMaturity?**: `number` \| `bigint`

***

### dataDir?

> `optional` **dataDir?**: `string`

Defined in: [packages/config/src/types.ts:29](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L29)

***

### description?

> `optional` **description?**: `string`

Defined in: [packages/config/src/types.ts:31](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L31)

***

### kind

> **kind**: `"kaspa-node"`

Defined in: [packages/config/src/types.ts:26](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L26)

***

### maxFeeRate?

> `optional` **maxFeeRate?**: `string` \| `number` \| `bigint`

Defined in: [packages/config/src/types.ts:38](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L38)

HK-09 / CA-TX-01: the highest fee RATE (sompi per gram) accepted from this network's node estimate; above it the plan is refused (FEE_RATE_ABOVE_BOUND).

***

### maxFeeSompi?

> `optional` **maxFeeSompi?**: `string` \| `number` \| `bigint`

Defined in: [packages/config/src/types.ts:36](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L36)

TX-FEE-GUARD-1: workspace limit on the TOTAL fee (sompi) of a transaction on this network, checked at plan, sign and send.

***

### network

> **network**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"devnet"`

Defined in: [packages/config/src/types.ts:27](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L27)

***

### rpcUrl?

> `optional` **rpcUrl?**: `string`

Defined in: [packages/config/src/types.ts:28](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L28)
