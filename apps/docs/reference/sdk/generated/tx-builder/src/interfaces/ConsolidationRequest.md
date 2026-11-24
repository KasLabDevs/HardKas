[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / ConsolidationRequest

# Interface: ConsolidationRequest

Defined in: [packages/tx-builder/src/service.ts:58](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L58)

## Properties

### feeRate?

> `optional` **feeRate?**: `bigint`

Defined in: [packages/tx-builder/src/service.ts:62](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L62)

***

### fromAddress

> **fromAddress**: `string`

Defined in: [packages/tx-builder/src/service.ts:59](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L59)

***

### networkId?

> `optional` **networkId?**: `string`

Defined in: [packages/tx-builder/src/service.ts:64](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L64)

Network whose parameters the Generator applies (defaults to simnet).

***

### selectedUtxos

> **selectedUtxos**: [`Utxo`](Utxo.md)[]

Defined in: [packages/tx-builder/src/service.ts:60](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L60)

***

### simulated?

> `optional` **simulated?**: `boolean`

Defined in: [packages/tx-builder/src/service.ts:66](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L66)

The UTXOs are the simulator's (synthetic identities), never a real network's.

***

### toAddress

> **toAddress**: `string`

Defined in: [packages/tx-builder/src/service.ts:61](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L61)

***

### virtualDaaScore?

> `optional` **virtualDaaScore?**: `bigint`

Defined in: [packages/tx-builder/src/service.ts:71](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L71)

HK-10: the virtual DAA score the UTXOs were read at, for the coinbase-maturity filter. When absent, the provider's
`getVirtualDaaScore` is asked; without either, coinbase UTXOs are left out on a real network.
