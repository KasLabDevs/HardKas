[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1PlanOutput

# Interface: V1PlanOutput

Defined in: [packages/tx-builder/src/v1-plan.ts:86](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L86)

## Properties

### address

> `readonly` **address**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:87](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L87)

***

### amountSompi

> `readonly` **amountSompi**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:88](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L88)

***

### covenant?

> `readonly` `optional` **covenant?**: `object`

Defined in: [packages/tx-builder/src/v1-plan.ts:90](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L90)

A continuation: the output is bound to an existing covenant, authorized by that covenant's input.

#### authorizingInput

> `readonly` **authorizingInput**: `number`

#### covenantId

> `readonly` **covenantId**: `string`

***

### role?

> `readonly` `optional` **role?**: `"payment"` \| `"change"`

Defined in: [packages/tx-builder/src/v1-plan.ts:96](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L96)

"change": the P2PK change back to the funder (F1.4 checks it goes only there). "payment": an output the plan's author
declares on purpose (a contract's release, a sweep). Bound outputs and genesis members need no role; any other
output is undeclared (V1_OUTPUT_UNDECLARED).
