[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1ContractRef

# Interface: V1ContractRef

Defined in: [packages/tx-builder/src/v1-plan.ts:41](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L41)

The contract an input unlocks: its sealed compile record, the entry called and its arguments.

## Properties

### args

> `readonly` **args**: readonly [`V1ArgValue`](../type-aliases/V1ArgValue.md)[]

Defined in: [packages/tx-builder/src/v1-plan.ts:59](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L59)

***

### compileRecord

> `readonly` **compileRecord**: `object`

Defined in: [packages/tx-builder/src/v1-plan.ts:42](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L42)

#### artifactSha256

> `readonly` **artifactSha256**: `string`

#### contentHash

> `readonly` **contentHash**: `string`

#### path?

> `readonly` `optional` **path?**: `string`

***

### constructorArgs

> `readonly` **constructorArgs**: readonly [`V1ArgValue`](../type-aliases/V1ArgValue.md)[]

Defined in: [packages/tx-builder/src/v1-plan.ts:45](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L45)

The constructor arguments of the compile record (checked against the record's digest, reproduced by silverc).

***

### contract

> `readonly` **contract**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:43](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L43)

***

### entry

> `readonly` **entry**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:56](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L56)

The ABI entry the unlock calls. For a covenant input: the generated entry of its declaration (auth:
`__covenant_entrypoint_auth_<policy>`; cov: the leader entry at the group's first input, the delegate entry at the
others).

***

### policy?

> `readonly` `optional` **policy?**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:58](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L58)

For a covenant input: the declaration (policy) of the transition (a delegate names its leader's).

***

### state?

> `readonly` `optional` **state?**: `Readonly`\<`Record`\<`string`, [`V1ArgValue`](../type-aliases/V1ArgValue.md)\>\>

Defined in: [packages/tx-builder/src/v1-plan.ts:50](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L50)

Phase 2 · the State the spent UTXO holds when it is not the compile record's own (a successor a transition created):
the input is then locked to the record's template with this state encoded in it (silverscript-abi), every field given.
