[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / EvidenceManager

# Class: EvidenceManager

Defined in: [packages/sdk/src/evidence.ts:19](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/evidence.ts#L19)

## Constructors

### Constructor

> **new EvidenceManager**(): `EvidenceManager`

#### Returns

`EvidenceManager`

## Methods

### explain()

> `static` **explain**(`packagePath`): `Promise`\<`string`\>

Defined in: [packages/sdk/src/evidence.ts:145](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/evidence.ts#L145)

Explains an Evidence Package V1

#### Parameters

##### packagePath

`string`

#### Returns

`Promise`\<`string`\>

***

### pack()

> `static` **pack**(`options`): `Promise`\<`string`\>

Defined in: [packages/sdk/src/evidence.ts:23](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/evidence.ts#L23)

Packs a Scenario Result into a verifiable Evidence Package V1

#### Parameters

##### options

[`EvidencePackOptions`](../interfaces/EvidencePackOptions.md)

#### Returns

`Promise`\<`string`\>

***

### verify()

> `static` **verify**(`packagePath`): `Promise`\<[`EvidenceVerifyResult`](../interfaces/EvidenceVerifyResult.md)\>

Defined in: [packages/sdk/src/evidence.ts:104](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/evidence.ts#L104)

Verifies an Evidence Package V1

#### Parameters

##### packagePath

`string`

#### Returns

`Promise`\<[`EvidenceVerifyResult`](../interfaces/EvidenceVerifyResult.md)\>
