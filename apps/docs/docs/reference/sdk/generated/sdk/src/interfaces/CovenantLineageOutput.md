[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / CovenantLineageOutput

# Interface: CovenantLineageOutput

Defined in: [packages/sdk/src/covenant-lineage.ts:21](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L21)

An output a transaction bound to the covenant.

## Properties

### address

> `readonly` **address**: `string`

Defined in: [packages/sdk/src/covenant-lineage.ts:24](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L24)

***

### amountSompi

> `readonly` **amountSompi**: `bigint`

Defined in: [packages/sdk/src/covenant-lineage.ts:25](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L25)

***

### declaredState?

> `readonly` `optional` **declaredState?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [packages/sdk/src/covenant-lineage.ts:29](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L29)

The state the transaction declared for it (field → value, the plan's or the record's), when one was declared.

***

### outpoint

> `readonly` **outpoint**: `string`

Defined in: [packages/sdk/src/covenant-lineage.ts:23](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L23)

"txid:index"

***

### scriptPublicKey?

> `readonly` `optional` **scriptPublicKey?**: `string`

Defined in: [packages/sdk/src/covenant-lineage.ts:27](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L27)

"vvvv" + script, hex

***

### stateSource?

> `readonly` `optional` **stateSource?**: \{ `contract`: `any`; `kind`: `"v1-contract"`; `state?`: `Readonly`\<`Record`\<`string`, `unknown`\>\>; \} \| \{ `compileRecord`: \{ `artifactSha256?`: `string`; `contentHash`: `string`; `path?`: `string`; \}; `contract`: `string`; `kind`: `"silver-compile-record"`; \}

Defined in: [packages/sdk/src/covenant-lineage.ts:31](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L31)

How the declared state can be checked against the address: the contract of the plan, or the compile record of the state.
