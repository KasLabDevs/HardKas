[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / CreateV1TxPlanArtifactOptions

# Interface: CreateV1TxPlanArtifactOptions

Defined in: [packages/artifacts/src/tx-plan-v1.ts:15](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan-v1.ts#L15)

F1.1 · a v1 transaction plan artifact: the TxPlan schema (`hardkas.txPlan`) with `txVersion: 1` and the v1 fields
(per-input kind, compute budget and contract reference; output bindings and genesis groups; payload; storage mass; the
mandatory fee limit; the covenant outpoints it spends; the declared next state). Its shape is checked
(assertV1PlanShape) before its identity is sealed, so an artifact that exists is at least well-formed; what the node
and the compiler say about it is checked at signing (F1.4).

## Properties

### amountSompi

> `readonly` **amountSompi**: `bigint`

Defined in: [packages/artifacts/src/tx-plan-v1.ts:23](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan-v1.ts#L23)

The value the plan moves to `to` (for a covenant: the value locked in it).

***

### body

> `readonly` **body**: `V1PlanBody`

Defined in: [packages/artifacts/src/tx-plan-v1.ts:24](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan-v1.ts#L24)

***

### ctx

> `readonly` **ctx**: `RuntimeContext`

Defined in: [packages/artifacts/src/tx-plan-v1.ts:26](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan-v1.ts#L26)

***

### from

> `readonly` **from**: `object`

Defined in: [packages/artifacts/src/tx-plan-v1.ts:19](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan-v1.ts#L19)

The funder (who pays the fee and receives the change).

#### accountName?

> `readonly` `optional` **accountName?**: `string`

#### address

> `readonly` **address**: `string`

#### input

> `readonly` **input**: `string`

***

### mode

> `readonly` **mode**: `"rpc"` \| `"simulator"` \| `"localnet"`

Defined in: [packages/artifacts/src/tx-plan-v1.ts:17](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan-v1.ts#L17)

***

### networkId

> `readonly` **networkId**: [`NetworkId`](../../../sdk/src/type-aliases/NetworkId.md)

Defined in: [packages/artifacts/src/tx-plan-v1.ts:16](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan-v1.ts#L16)

***

### purpose?

> `readonly` `optional` **purpose?**: `string`

Defined in: [packages/artifacts/src/tx-plan-v1.ts:28](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan-v1.ts#L28)

What produced the plan, recorded as plannerAuthorityDetail (e.g. "covenant genesis", "covenant transition").

***

### rpcUrl?

> `readonly` `optional` **rpcUrl?**: `string`

Defined in: [packages/artifacts/src/tx-plan-v1.ts:25](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan-v1.ts#L25)

***

### to

> `readonly` **to**: `object`

Defined in: [packages/artifacts/src/tx-plan-v1.ts:21](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan-v1.ts#L21)

The primary destination (a covenant or contract address, or a payee).

#### address

> `readonly` **address**: `string`

#### input

> `readonly` **input**: `string`
