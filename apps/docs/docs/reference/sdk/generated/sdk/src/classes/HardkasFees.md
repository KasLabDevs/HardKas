[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasFees

# Class: HardkasFees

Defined in: [packages/sdk/src/fees.ts:14](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/fees.ts#L14)

**`Alpha`**

HardKAS Fees Module

## Constructors

### Constructor

> **new HardkasFees**(`sdk`): `HardkasFees`

Defined in: [packages/sdk/src/fees.ts:15](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/fees.ts#L15)

**`Alpha`**

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasFees`

## Methods

### estimate()

> **estimate**(`options`): `Promise`\<\{ `estimatedFee`: `bigint`; `estimatedMass`: `bigint`; `evidence`: `"dynamic"` \| `"heuristic"`; `feeRate`: `bigint`; `mempoolSize?`: `number`; `nodeFeeRate?`: `number`; `source`: `"node-estimate"` \| `"network-minimum"`; \}\>

Defined in: [packages/sdk/src/fees.ts:29](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/fees.ts#L29)

**`Alpha`**

Estimates the fee rate (sompi per gram) for a priority from the node's fee estimate (HK-09).

- The node's `getFeeEstimate` answer (`{ estimate: { priorityBucket, normalBuckets, lowBuckets } }`) is read in that
  shape; the bucket follows the priority (fast / normal / slow). Never below the relay minimum (100 sompi/gram).
- A node's rate above `maxFeeRate` (option, else `networks[<net>].maxFeeRate`, else 10,000) is refused with
  FEE_RATE_ABOVE_BOUND (CA-TX-01).
- `evidence` is "dynamic" only when the node's estimate was read and used ("heuristic" = the relay minimum).

The mass and fee here are a SHAPE estimate (no amounts, hence no storage mass): plans are priced by the Generator over
the real transaction. At the relay minimum the estimated fee is the minimum for the shape's compute mass.

#### Parameters

##### options

###### computeBudget?

`bigint`

###### computeGrams?

`bigint`

###### inputs

`number` \| readonly `any`[]

###### maxFeeRate?

`bigint`

CA-TX-01: upper bound on the node's rate, sompi per gram.

###### network?

`string`

###### outputs

`number` \| readonly `any`[]

###### priority

`FeePriority`

###### version?

`0` \| `1`

#### Returns

`Promise`\<\{ `estimatedFee`: `bigint`; `estimatedMass`: `bigint`; `evidence`: `"dynamic"` \| `"heuristic"`; `feeRate`: `bigint`; `mempoolSize?`: `number`; `nodeFeeRate?`: `number`; `source`: `"node-estimate"` \| `"network-minimum"`; \}\>
