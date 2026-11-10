[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / NodeReading

# Interface: NodeReading

Defined in: [packages/sdk/src/multinode-read.ts:31](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L31)

## Properties

### endpoint?

> `readonly` `optional` **endpoint?**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:34](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L34)

The client's endpoint, without credentials (absent when the client does not say).

***

### hasUtxoIndex?

> `readonly` `optional` **hasUtxoIndex?**: `boolean`

Defined in: [packages/sdk/src/multinode-read.ts:43](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L43)

***

### isSynced?

> `readonly` `optional` **isSynced?**: `boolean`

Defined in: [packages/sdk/src/multinode-read.ts:42](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L42)

***

### label

> `readonly` **label**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:32](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L32)

***

### lagDaa?

> `readonly` `optional` **lagDaa?**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:49](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L49)

How far behind the most advanced node of the set it is, in DAA score (0 for that node).

***

### network?

> `readonly` `optional` **network?**: `object`

Defined in: [packages/sdk/src/multinode-read.ts:38](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L38)

getServerInfo.networkId and getBlockDagInfo.network, as the node gave them.

#### dag?

> `readonly` `optional` **dag?**: `string`

#### server?

> `readonly` `optional` **server?**: `string`

***

### p2pId?

> `readonly` `optional` **p2pId?**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:40](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L40)

getInfo.p2pId: the node's own id (two endpoints answering with one id are one node).

***

### pruningPointHash?

> `readonly` `optional` **pruningPointHash?**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:47](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L47)

***

### readAt

> `readonly` **readAt**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:50](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L50)

***

### reasons

> `readonly` **reasons**: readonly `string`[]

Defined in: [packages/sdk/src/multinode-read.ts:36](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L36)

***

### serverVersion?

> `readonly` `optional` **serverVersion?**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:41](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L41)

***

### sink?

> `readonly` `optional` **sink?**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:45](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L45)

***

### sinkBlueScore?

> `readonly` `optional` **sinkBlueScore?**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:46](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L46)

***

### standing

> `readonly` **standing**: [`NodeStanding`](../type-aliases/NodeStanding.md)

Defined in: [packages/sdk/src/multinode-read.ts:35](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L35)

***

### virtualDaaScore?

> `readonly` `optional` **virtualDaaScore?**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:44](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L44)
