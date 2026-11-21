[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasProgrammability

# Class: HardkasProgrammability

Defined in: [packages/sdk/src/programmability.ts:143](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/programmability.ts#L143)

## Constructors

### Constructor

> **new HardkasProgrammability**(`sdk`): `HardkasProgrammability`

Defined in: [packages/sdk/src/programmability.ts:157](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/programmability.ts#L157)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasProgrammability`

## Properties

### app

> `readonly` **app**: `object`

Defined in: [packages/sdk/src/programmability.ts:150](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/programmability.ts#L150)

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

Defined in: [packages/sdk/src/programmability.ts:144](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/programmability.ts#L144)

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

Defined in: [packages/sdk/src/programmability.ts:166](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/programmability.ts#L166)

#### Returns

`Promise`\<[`ProgrammabilityCapabilitiesResult`](../interfaces/ProgrammabilityCapabilitiesResult.md)\>

***

### inspect()

> **inspect**(`options`): `Promise`\<[`ProgrammabilityInspectResult`](../interfaces/ProgrammabilityInspectResult.md)\>

Defined in: [packages/sdk/src/programmability.ts:170](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/programmability.ts#L170)

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

Defined in: [packages/sdk/src/programmability.ts:213](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/programmability.ts#L213)

#### Parameters

##### options

###### kind

`"silver"` \| `"zk"` \| `"vprog"`

###### path

`string`

#### Returns

`Promise`\<[`ProgrammabilityVerifyResult`](../interfaces/ProgrammabilityVerifyResult.md)\>
