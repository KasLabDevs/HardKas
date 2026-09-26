[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / UtxoProvider

# Interface: UtxoProvider

Defined in: [packages/tx-builder/src/service.ts:8](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L8)

## Methods

### getUtxos()

> **getUtxos**(`address`): `Promise`\<[`Utxo`](Utxo.md)[]\>

Defined in: [packages/tx-builder/src/service.ts:9](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L9)

#### Parameters

##### address

`string`

#### Returns

`Promise`\<[`Utxo`](Utxo.md)[]\>

***

### getVirtualDaaScore()?

> `optional` **getVirtualDaaScore**(): `Promise`\<`bigint`\>

Defined in: [packages/tx-builder/src/service.ts:10](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L10)

#### Returns

`Promise`\<`bigint`\>
