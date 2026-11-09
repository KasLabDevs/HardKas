[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / CreateTxPlanArtifactOptions

# Interface: CreateTxPlanArtifactOptions

Defined in: [packages/artifacts/src/tx-plan.ts:10](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan.ts#L10)

## Properties

### amountSompi

> **amountSompi**: `bigint`

Defined in: [packages/artifacts/src/tx-plan.ts:22](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan.ts#L22)

***

### ctx

> **ctx**: `RuntimeContext`

Defined in: [packages/artifacts/src/tx-plan.ts:25](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan.ts#L25)

***

### from

> **from**: `object`

Defined in: [packages/artifacts/src/tx-plan.ts:13](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan.ts#L13)

#### accountName?

> `optional` **accountName?**: `string`

#### address

> **address**: `string`

#### input

> **input**: `string`

***

### maxFeeSompi?

> `optional` **maxFeeSompi?**: `bigint`

Defined in: [packages/artifacts/src/tx-plan.ts:30](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan.ts#L30)

TX-FEE-GUARD-1: the total fee limit (sompi) this plan was made under, recorded inside its identity so signing and
sending enforce it on the plan as authenticated. Absent = the plan carries no limit of its own.

***

### mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"`

Defined in: [packages/artifacts/src/tx-plan.ts:12](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan.ts#L12)

***

### networkId

> **networkId**: [`NetworkId`](../../../sdk/src/type-aliases/NetworkId.md)

Defined in: [packages/artifacts/src/tx-plan.ts:11](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan.ts#L11)

***

### plan

> **plan**: `TxPlan`

Defined in: [packages/artifacts/src/tx-plan.ts:23](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan.ts#L23)

***

### rpcUrl?

> `optional` **rpcUrl?**: `string`

Defined in: [packages/artifacts/src/tx-plan.ts:24](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan.ts#L24)

***

### to

> **to**: `object`

Defined in: [packages/artifacts/src/tx-plan.ts:18](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan.ts#L18)

#### address

> **address**: `string`

#### input

> **input**: `string`
