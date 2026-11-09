[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / FeeLimitInForce

# Interface: FeeLimitInForce

Defined in: [packages/tx-builder/src/fee-policy.ts:68](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/fee-policy.ts#L68)

## Properties

### maxFeeSompi

> `readonly` **maxFeeSompi**: `bigint`

Defined in: [packages/tx-builder/src/fee-policy.ts:69](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/fee-policy.ts#L69)

***

### source

> `readonly` **source**: `"plan"` \| `"network-config"` \| `"default"`

Defined in: [packages/tx-builder/src/fee-policy.ts:71](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/fee-policy.ts#L71)

Where the limit comes from: the plan's own, the workspace's for the network, or HardKAS's default.
