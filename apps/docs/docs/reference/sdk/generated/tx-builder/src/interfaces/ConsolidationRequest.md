[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / ConsolidationRequest

# Interface: ConsolidationRequest

Defined in: [packages/tx-builder/src/service.ts:57](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L57)

## Properties

### feeRate?

> `optional` **feeRate?**: `bigint`

Defined in: [packages/tx-builder/src/service.ts:61](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L61)

***

### fromAddress

> **fromAddress**: `string`

Defined in: [packages/tx-builder/src/service.ts:58](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L58)

***

### networkId?

> `optional` **networkId?**: `string`

Defined in: [packages/tx-builder/src/service.ts:63](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L63)

Network whose parameters the Generator applies (defaults to simnet).

***

### selectedUtxos

> **selectedUtxos**: [`Utxo`](Utxo.md)[]

Defined in: [packages/tx-builder/src/service.ts:59](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L59)

***

### simulated?

> `optional` **simulated?**: `boolean`

Defined in: [packages/tx-builder/src/service.ts:65](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L65)

The UTXOs are the simulator's (synthetic identities), never a real network's.

***

### toAddress

> **toAddress**: `string`

Defined in: [packages/tx-builder/src/service.ts:60](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L60)

***

### virtualDaaScore?

> `optional` **virtualDaaScore?**: `bigint`

Defined in: [packages/tx-builder/src/service.ts:70](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L70)

HK-10: the virtual DAA score the UTXOs were read at, for the coinbase-maturity filter. When absent, the provider's
`getVirtualDaaScore` is asked; without either, coinbase UTXOs are left out on a real network.
