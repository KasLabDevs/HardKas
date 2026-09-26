[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasProgrammability

# Class: HardkasProgrammability

Defined in: [packages/sdk/src/programmability.ts:117](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L117)

## Constructors

### Constructor

> **new HardkasProgrammability**(`sdk`): `HardkasProgrammability`

Defined in: [packages/sdk/src/programmability.ts:131](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L131)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasProgrammability`

## Properties

### app

> `readonly` **app**: `object`

Defined in: [packages/sdk/src/programmability.ts:124](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L124)

#### plan

> **plan**: (`options?`) => [`ProgrammabilityAppPlan`](../interfaces/ProgrammabilityAppPlan.md)

##### Parameters

###### options?

###### kind?

[`ProgrammabilityKind`](../type-aliases/ProgrammabilityKind.md)

###### template?

`string`

##### Returns

[`ProgrammabilityAppPlan`](../interfaces/ProgrammabilityAppPlan.md)

***

### corpus

> `readonly` **corpus**: `object`

Defined in: [packages/sdk/src/programmability.ts:118](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L118)

#### verify

> **verify**: (`options?`) => `Promise`\<[`ProgrammabilityCorpusReport`](../interfaces/ProgrammabilityCorpusReport.md)\>

##### Parameters

###### options?

###### include?

(`"silver"` \| `"zk"` \| `"vprogs"`)[]

###### path?

`string`

##### Returns

`Promise`\<[`ProgrammabilityCorpusReport`](../interfaces/ProgrammabilityCorpusReport.md)\>

## Methods

### capabilities()

> **capabilities**(): `Promise`\<[`ProgrammabilityCapabilitiesResult`](../interfaces/ProgrammabilityCapabilitiesResult.md)\>

Defined in: [packages/sdk/src/programmability.ts:140](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L140)

#### Returns

`Promise`\<[`ProgrammabilityCapabilitiesResult`](../interfaces/ProgrammabilityCapabilitiesResult.md)\>

***

### inspect()

> **inspect**(`options`): `Promise`\<[`ProgrammabilityInspectResult`](../interfaces/ProgrammabilityInspectResult.md)\>

Defined in: [packages/sdk/src/programmability.ts:144](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L144)

#### Parameters

##### options

###### kind

`"silver"` \| `"zk"` \| `"vprog"`

###### path

`string`

#### Returns

`Promise`\<[`ProgrammabilityInspectResult`](../interfaces/ProgrammabilityInspectResult.md)\>

***

### verify()

> **verify**(`options`): `Promise`\<[`ProgrammabilityVerifyResult`](../interfaces/ProgrammabilityVerifyResult.md)\>

Defined in: [packages/sdk/src/programmability.ts:187](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/programmability.ts#L187)

#### Parameters

##### options

###### kind

`"silver"` \| `"zk"` \| `"vprog"`

###### path

`string`

#### Returns

`Promise`\<[`ProgrammabilityVerifyResult`](../interfaces/ProgrammabilityVerifyResult.md)\>
