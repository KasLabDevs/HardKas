[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / UpstreamMassResult

# Interface: UpstreamMassResult

Defined in: [packages/tx-builder/src/mass.ts:80](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L80)

## Properties

### assumptions

> `readonly` **assumptions**: `string`[]

Defined in: [packages/tx-builder/src/mass.ts:98](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L98)

***

### authority

> `readonly` **authority**: `string`

Defined in: [packages/tx-builder/src/mass.ts:97](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L97)

***

### mass

> `readonly` **mass**: `bigint`

Defined in: [packages/tx-builder/src/mass.ts:82](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L82)

Mass as the node computes it (compute or storage mass, whichever binds).

***

### maximumStandardMass

> `readonly` **maximumStandardMass**: `bigint`

Defined in: [packages/tx-builder/src/mass.ts:96](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L96)

***

### minimumFeeSompi

> `readonly` **minimumFeeSompi**: `bigint`

Defined in: [packages/tx-builder/src/mass.ts:89](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L89)

The SDK's `calculateTransactionFee`: the network's minimum rate over the overall
mass (meaningless when `standard` is false). When storage mass binds it is above
what the node requires (see [measureRelayFee](../functions/measureRelayFee.md)); a fee that pays it is always
relayed.

***

### standard

> `readonly` **standard**: `boolean`

Defined in: [packages/tx-builder/src/mass.ts:95](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L95)

False when the mass exceeds the wallet's maximum standard transaction mass (100,000 g, wallet/core/src/tx/mass.rs).
L1-08: a wallet policy the kaspa-wasm Generator applies, not a node relay rule (the v2.1.0 mempool bounds masses by the
block limits); HardKAS does not build such a transaction.
