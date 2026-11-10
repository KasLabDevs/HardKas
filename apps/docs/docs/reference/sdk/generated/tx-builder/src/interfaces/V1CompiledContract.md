[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1CompiledContract

# Interface: V1CompiledContract

Defined in: [packages/tx-builder/src/v1-plan.ts:33](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L33)

A sealed silver compile record and the constructor arguments it was compiled with (public data: silverc reproduces it).

## Properties

### compileRecord

> `readonly` **compileRecord**: `object`

Defined in: [packages/tx-builder/src/v1-plan.ts:34](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L34)

#### artifactSha256

> `readonly` **artifactSha256**: `string`

#### contentHash

> `readonly` **contentHash**: `string`

#### path?

> `readonly` `optional` **path?**: `string`

***

### constructorArgs

> `readonly` **constructorArgs**: readonly [`V1ArgValue`](../type-aliases/V1ArgValue.md)[]

Defined in: [packages/tx-builder/src/v1-plan.ts:36](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L36)

***

### contract

> `readonly` **contract**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:35](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L35)
