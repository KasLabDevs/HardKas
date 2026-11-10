[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1ContractRef

# Interface: V1ContractRef

Defined in: [packages/tx-builder/src/v1-plan.ts:40](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L40)

The contract an input unlocks: its sealed compile record, the entry called and its arguments.

## Properties

### args

> `readonly` **args**: readonly [`V1ArgValue`](../type-aliases/V1ArgValue.md)[]

Defined in: [packages/tx-builder/src/v1-plan.ts:58](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L58)

***

### compileRecord

> `readonly` **compileRecord**: `object`

Defined in: [packages/tx-builder/src/v1-plan.ts:41](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L41)

#### artifactSha256

> `readonly` **artifactSha256**: `string`

#### contentHash

> `readonly` **contentHash**: `string`

#### path?

> `readonly` `optional` **path?**: `string`

***

### constructorArgs

> `readonly` **constructorArgs**: readonly [`V1ArgValue`](../type-aliases/V1ArgValue.md)[]

Defined in: [packages/tx-builder/src/v1-plan.ts:44](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L44)

The constructor arguments of the compile record (checked against the record's digest, reproduced by silverc).

***

### contract

> `readonly` **contract**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:42](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L42)

***

### entry

> `readonly` **entry**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:55](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L55)

The ABI entry the unlock calls. For a covenant input: the generated entry of its declaration (auth:
`__covenant_entrypoint_auth_<policy>`; cov: the leader entry at the group's first input, the delegate entry at the
others).

***

### policy?

> `readonly` `optional` **policy?**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:57](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L57)

For a covenant input: the declaration (policy) of the transition (a delegate names its leader's).

***

### state?

> `readonly` `optional` **state?**: `Readonly`\<`Record`\<`string`, [`V1ArgValue`](../type-aliases/V1ArgValue.md)\>\>

Defined in: [packages/tx-builder/src/v1-plan.ts:49](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L49)

Phase 2 · the State the spent UTXO holds when it is not the compile record's own (a successor a transition created):
the input is then locked to the record's template with this state encoded in it (silverscript-abi), every field given.
