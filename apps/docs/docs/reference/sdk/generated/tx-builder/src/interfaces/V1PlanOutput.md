[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1PlanOutput

# Interface: V1PlanOutput

Defined in: [packages/tx-builder/src/v1-plan.ts:85](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L85)

## Properties

### address

> `readonly` **address**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:86](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L86)

***

### amountSompi

> `readonly` **amountSompi**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:87](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L87)

***

### covenant?

> `readonly` `optional` **covenant?**: `object`

Defined in: [packages/tx-builder/src/v1-plan.ts:89](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L89)

A continuation: the output is bound to an existing covenant, authorized by that covenant's input.

#### authorizingInput

> `readonly` **authorizingInput**: `number`

#### covenantId

> `readonly` **covenantId**: `string`

***

### role?

> `readonly` `optional` **role?**: `"payment"` \| `"change"`

Defined in: [packages/tx-builder/src/v1-plan.ts:95](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L95)

"change": the P2PK change back to the funder (F1.4 checks it goes only there). "payment": an output the plan's author
declares on purpose (a contract's release, a sweep). Bound outputs and genesis members need no role; any other
output is undeclared (V1_OUTPUT_UNDECLARED).
