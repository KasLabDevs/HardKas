[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / UtxoProvider

# Interface: UtxoProvider

Defined in: [packages/tx-builder/src/service.ts:6](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L6)

## Methods

### getUtxos()

> **getUtxos**(`address`): `Promise`\<[`Utxo`](Utxo.md)[]\>

Defined in: [packages/tx-builder/src/service.ts:7](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L7)

#### Parameters

##### address

`string`

#### Returns

`Promise`\<[`Utxo`](Utxo.md)[]\>

***

### getVirtualDaaScore()?

> `optional` **getVirtualDaaScore**(): `Promise`\<`bigint`\>

Defined in: [packages/tx-builder/src/service.ts:8](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L8)

#### Returns

`Promise`\<`bigint`\>
