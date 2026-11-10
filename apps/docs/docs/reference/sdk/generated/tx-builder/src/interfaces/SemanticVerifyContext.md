[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / SemanticVerifyContext

# Interface: SemanticVerifyContext

Defined in: [packages/tx-builder/src/verify.ts:40](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/verify.ts#L40)

## Properties

### expectedChangeAddress?

> `optional` **expectedChangeAddress?**: `string`

Defined in: [packages/tx-builder/src/verify.ts:48](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/verify.ts#L48)

Expected change address

***

### minFeeRate?

> `optional` **minFeeRate?**: `bigint`

Defined in: [packages/tx-builder/src/verify.ts:50](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/verify.ts#L50)

Minimum fee rate required by the node

***

### utxoContext?

> `optional` **utxoContext?**: `object`[]

Defined in: [packages/tx-builder/src/verify.ts:42](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/verify.ts#L42)

Known UTXOs to verify lineage against

#### address

> **address**: `string`

#### amountSompi

> **amountSompi**: `bigint`

#### outpoint

> **outpoint**: `object`

##### outpoint.index

> **index**: `number`

##### outpoint.transactionId

> **transactionId**: `string`
