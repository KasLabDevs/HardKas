[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasLineage

# Class: HardkasLineage

Defined in: [packages/sdk/src/lineage.ts:7](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/lineage.ts#L7)

**`Alpha`**

HardKAS Lineage Module

## Constructors

### Constructor

> **new HardkasLineage**(`sdk`): `HardkasLineage`

Defined in: [packages/sdk/src/lineage.ts:8](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/lineage.ts#L8)

**`Alpha`**

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasLineage`

## Methods

### trace()

> **trace**(`target`, `options?`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/lineage.ts:13](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/lineage.ts#L13)

**`Alpha`**

Traces the lineage of an artifact, identifying ancestors and descendants.

#### Parameters

##### target

`string` \| \{ `artifactId?`: `string`; `contentHash?`: `string`; \}

##### options?

###### direction?

`"ancestors"` \| `"descendants"`

#### Returns

`Promise`\<`any`\>
