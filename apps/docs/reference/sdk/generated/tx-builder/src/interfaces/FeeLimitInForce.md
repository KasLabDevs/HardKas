[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / FeeLimitInForce

# Interface: FeeLimitInForce

Defined in: [packages/tx-builder/src/fee-policy.ts:77](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/fee-policy.ts#L77)

## Properties

### maxFeeSompi

> `readonly` **maxFeeSompi**: `bigint`

Defined in: [packages/tx-builder/src/fee-policy.ts:78](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/fee-policy.ts#L78)

***

### source

> `readonly` **source**: `"default"` \| `"plan"` \| `"network-config"`

Defined in: [packages/tx-builder/src/fee-policy.ts:80](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/fee-policy.ts#L80)

Where the limit comes from: the plan's own, the workspace's for the network, or HardKAS's default.
