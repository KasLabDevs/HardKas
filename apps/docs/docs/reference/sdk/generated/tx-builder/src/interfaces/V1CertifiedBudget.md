[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1CertifiedBudget

# Interface: V1CertifiedBudget

Defined in: [packages/tx-builder/src/v1-budgets.ts:35](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-budgets.ts#L35)

## Properties

### budget

> `readonly` **budget**: `number`

Defined in: [packages/tx-builder/src/v1-budgets.ts:40](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-budgets.ts#L40)

***

### entry?

> `readonly` `optional` **entry?**: `string`

Defined in: [packages/tx-builder/src/v1-budgets.ts:39](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-budgets.ts#L39)

***

### evidence

> `readonly` **evidence**: `string`

Defined in: [packages/tx-builder/src/v1-budgets.ts:42](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-budgets.ts#L42)

Where the value was measured (a node, its version, the evidence).

***

### kind

> `readonly` **kind**: `"p2pk"` \| `"contract"`

Defined in: [packages/tx-builder/src/v1-budgets.ts:37](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-budgets.ts#L37)

What it applies to: a P2PK Schnorr input, or a contract entry of one template.

***

### templateHash?

> `readonly` `optional` **templateHash?**: `string`

Defined in: [packages/tx-builder/src/v1-budgets.ts:38](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-budgets.ts#L38)
