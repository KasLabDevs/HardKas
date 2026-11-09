[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / NodeRejection

# Interface: NodeRejection

Defined in: [packages/artifacts/src/node-rejection.ts:29](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/node-rejection.ts#L29)

## Properties

### code

> `readonly` **code**: [`NodeRejectionCode`](../type-aliases/NodeRejectionCode.md)

Defined in: [packages/artifacts/src/node-rejection.ts:30](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/node-rejection.ts#L30)

***

### limitUnits?

> `readonly` `optional` **limitUnits?**: `string`

Defined in: [packages/artifacts/src/node-rejection.ts:35](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/node-rejection.ts#L35)

***

### retriable

> `readonly` **retriable**: `false`

Defined in: [packages/artifacts/src/node-rejection.ts:32](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/node-rejection.ts#L32)

A rejection is final for the transaction: never retried, rebuilt or re-sent.

***

### usedUnits?

> `readonly` `optional` **usedUnits?**: `string`

Defined in: [packages/artifacts/src/node-rejection.ts:34](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/node-rejection.ts#L34)

COMPUTE_BUDGET_INSUFFICIENT: the script units the node counted and the limit the input committed, as it reports them.
