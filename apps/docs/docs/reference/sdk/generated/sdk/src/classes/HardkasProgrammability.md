[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasProgrammability

# Class: HardkasProgrammability

Defined in: [packages/sdk/src/programmability.ts:119](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L119)

## Constructors

### Constructor

> **new HardkasProgrammability**(`sdk`): `HardkasProgrammability`

Defined in: [packages/sdk/src/programmability.ts:133](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L133)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasProgrammability`

## Properties

### app

> `readonly` **app**: `object`

Defined in: [packages/sdk/src/programmability.ts:126](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L126)

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

Defined in: [packages/sdk/src/programmability.ts:120](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L120)

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

Defined in: [packages/sdk/src/programmability.ts:142](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L142)

#### Returns

`Promise`\<[`ProgrammabilityCapabilitiesResult`](../interfaces/ProgrammabilityCapabilitiesResult.md)\>

***

### inspect()

> **inspect**(`options`): `Promise`\<[`ProgrammabilityInspectResult`](../interfaces/ProgrammabilityInspectResult.md)\>

Defined in: [packages/sdk/src/programmability.ts:146](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L146)

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

Defined in: [packages/sdk/src/programmability.ts:189](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/programmability.ts#L189)

#### Parameters

##### options

###### kind

`"silver"` \| `"zk"` \| `"vprog"`

###### path

`string`

#### Returns

`Promise`\<[`ProgrammabilityVerifyResult`](../interfaces/ProgrammabilityVerifyResult.md)\>
