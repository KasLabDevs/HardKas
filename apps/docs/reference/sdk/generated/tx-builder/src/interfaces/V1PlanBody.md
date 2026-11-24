[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1PlanBody

# Interface: V1PlanBody

Defined in: [packages/tx-builder/src/v1-plan.ts:143](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L143)

The v1 part of a TxPlan artifact (plus the base fields every plan has).

## Properties

### computeBudget?

> `readonly` `optional` **computeBudget?**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:158](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L158)

A v0 field; a v1 plan commits a budget per input instead (both at once is invalid).

***

### covenantOutpoints?

> `readonly` `optional` **covenantOutpoints?**: readonly `string`[]

Defined in: [packages/tx-builder/src/v1-plan.ts:155](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L155)

"txid:index" of every covenant input, so F1.6 finds pending sends by covenant.

***

### estimatedFeeSompi

> `readonly` **estimatedFeeSompi**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:149](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L149)

***

### estimatedMass

> `readonly` **estimatedMass**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:150](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L150)

***

### genesisCovenantGroups?

> `readonly` `optional` **genesisCovenantGroups?**: readonly [`V1GenesisGroup`](V1GenesisGroup.md)[]

Defined in: [packages/tx-builder/src/v1-plan.ts:147](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L147)

***

### inputs

> `readonly` **inputs**: readonly [`V1PlanInput`](V1PlanInput.md)[]

Defined in: [packages/tx-builder/src/v1-plan.ts:145](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L145)

***

### lockTime?

> `readonly` `optional` **lockTime?**: [`PlanLockTime`](../type-aliases/PlanLockTime.md)

Defined in: [packages/tx-builder/src/v1-plan.ts:160](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L160)

CLTV · the typed absolute lock time (\{ daaScore \} | \{ timestampMs \}); absent = 0 (lock-time.ts).

***

### maxFeeSompi?

> `readonly` `optional` **maxFeeSompi?**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:153](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L153)

Mandatory in v1 (V1_FEE_LIMIT_REQUIRED).

***

### nextState?

> `readonly` `optional` **nextState?**: readonly [`V1NextState`](../type-aliases/V1NextState.md)[]

Defined in: [packages/tx-builder/src/v1-plan.ts:156](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L156)

***

### outputs

> `readonly` **outputs**: readonly [`V1PlanOutput`](V1PlanOutput.md)[]

Defined in: [packages/tx-builder/src/v1-plan.ts:146](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L146)

***

### payload?

> `readonly` `optional` **payload?**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:148](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L148)

***

### storageMass

> `readonly` **storageMass**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:151](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L151)

***

### txVersion

> `readonly` **txVersion**: `1`

Defined in: [packages/tx-builder/src/v1-plan.ts:144](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L144)
