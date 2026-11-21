[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1GenesisGroup

# Interface: V1GenesisGroup

Defined in: [packages/tx-builder/src/v1-plan.ts:99](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L99)

## Properties

### authorizingInput

> `readonly` **authorizingInput**: `number`

Defined in: [packages/tx-builder/src/v1-plan.ts:100](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L100)

***

### contract?

> `readonly` `optional` **contract?**: [`V1CompiledContract`](V1CompiledContract.md)

Defined in: [packages/tx-builder/src/v1-plan.ts:103](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L103)

The contract the group's outputs are locked to (F1.4 checks each is that contract's P2SH).

***

### covenantId?

> `readonly` `optional` **covenantId?**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:105](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L105)

The covenant id the planner expects the group to get (F1.4 recomputes it: COVENANT_GENESIS_ID_MISMATCH).

***

### outputs

> `readonly` **outputs**: readonly `number`[]

Defined in: [packages/tx-builder/src/v1-plan.ts:101](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L101)

***

### states?

> `readonly` `optional` **states?**: readonly `Readonly`\<`Record`\<`string`, [`V1ArgValue`](../type-aliases/V1ArgValue.md)\>\>[]

Defined in: [packages/tx-builder/src/v1-plan.ts:110](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L110)

Phase 2 · the State each output of the group starts with, in the order of `outputs` (encoded into the contract's
template). Absent: every output holds the compile record's own state.
