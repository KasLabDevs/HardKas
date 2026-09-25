[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasFees

# Class: HardkasFees

Defined in: [packages/sdk/src/fees.ts:9](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/fees.ts#L9)

**`Alpha`**

HardKAS Fees Module

## Constructors

### Constructor

> **new HardkasFees**(`sdk`): `HardkasFees`

Defined in: [packages/sdk/src/fees.ts:10](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/fees.ts#L10)

**`Alpha`**

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasFees`

## Methods

### estimate()

> **estimate**(`options`): `Promise`\<\{ `estimatedFee`: `bigint`; `estimatedMass`: `bigint`; `evidence`: `"dynamic"` \| `"heuristic"`; `feeRate`: `bigint`; `mempoolSize?`: `number`; \}\>

Defined in: [packages/sdk/src/fees.ts:18](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/fees.ts#L18)

**`Alpha`**

Estimates the optimal fee rate (sompi per mass) based on priority.
Dynamically checks mempoolSize for congestion and calculates tx mass exactly.

Supports both V0 (legacy mass-based) and V1 (Toccata compute-based) fee routing.

#### Parameters

##### options

###### computeBudget?

`bigint`

###### computeGrams?

`bigint`

###### inputs

`number` \| readonly `any`[]

###### network?

`string`

###### outputs

`number` \| readonly `any`[]

###### priority

`FeePriority`

###### version?

`0` \| `1`

#### Returns

`Promise`\<\{ `estimatedFee`: `bigint`; `estimatedMass`: `bigint`; `evidence`: `"dynamic"` \| `"heuristic"`; `feeRate`: `bigint`; `mempoolSize?`: `number`; \}\>
