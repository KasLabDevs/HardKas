[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / UpstreamMassResult

# Interface: UpstreamMassResult

Defined in: [packages/tx-builder/src/mass.ts:69](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/mass.ts#L69)

## Properties

### assumptions

> `readonly` **assumptions**: `string`[]

Defined in: [packages/tx-builder/src/mass.ts:78](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/mass.ts#L78)

***

### authority

> `readonly` **authority**: `string`

Defined in: [packages/tx-builder/src/mass.ts:77](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/mass.ts#L77)

***

### mass

> `readonly` **mass**: `bigint`

Defined in: [packages/tx-builder/src/mass.ts:71](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/mass.ts#L71)

Mass as the node computes it (compute or storage mass, whichever binds).

***

### maximumStandardMass

> `readonly` **maximumStandardMass**: `bigint`

Defined in: [packages/tx-builder/src/mass.ts:76](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/mass.ts#L76)

***

### minimumFeeSompi

> `readonly` **minimumFeeSompi**: `bigint`

Defined in: [packages/tx-builder/src/mass.ts:73](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/mass.ts#L73)

Minimum fee the node requires for this transaction (meaningless when `standard` is false).

***

### standard

> `readonly` **standard**: `boolean`

Defined in: [packages/tx-builder/src/mass.ts:75](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/mass.ts#L75)

False when the mass exceeds the maximum standard transaction mass: the node will not relay it.
