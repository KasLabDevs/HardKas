[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / UpstreamMassResult

# Interface: UpstreamMassResult

Defined in: [packages/tx-builder/src/mass.ts:69](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/mass.ts#L69)

## Properties

### assumptions

> `readonly` **assumptions**: `string`[]

Defined in: [packages/tx-builder/src/mass.ts:87](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/mass.ts#L87)

***

### authority

> `readonly` **authority**: `string`

Defined in: [packages/tx-builder/src/mass.ts:86](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/mass.ts#L86)

***

### mass

> `readonly` **mass**: `bigint`

Defined in: [packages/tx-builder/src/mass.ts:71](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/mass.ts#L71)

Mass as the node computes it (compute or storage mass, whichever binds).

***

### maximumStandardMass

> `readonly` **maximumStandardMass**: `bigint`

Defined in: [packages/tx-builder/src/mass.ts:85](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/mass.ts#L85)

***

### minimumFeeSompi

> `readonly` **minimumFeeSompi**: `bigint`

Defined in: [packages/tx-builder/src/mass.ts:78](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/mass.ts#L78)

The SDK's `calculateTransactionFee`: the network's minimum rate over the overall
mass (meaningless when `standard` is false). When storage mass binds it is above
what the node requires (see [measureRelayFee](../functions/measureRelayFee.md)); a fee that pays it is always
relayed.

***

### standard

> `readonly` **standard**: `boolean`

Defined in: [packages/tx-builder/src/mass.ts:84](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/mass.ts#L84)

False when the mass exceeds the wallet's maximum standard transaction mass (100,000 g, wallet/core/src/tx/mass.rs).
L1-08: a wallet policy the kaspa-wasm Generator applies, not a node relay rule (the v2.1.0 mempool bounds masses by the
block limits); HardKAS does not build such a transaction.
