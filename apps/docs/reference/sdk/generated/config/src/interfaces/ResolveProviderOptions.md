[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / ResolveProviderOptions

# Interface: ResolveProviderOptions

Defined in: [packages/config/src/provider.ts:5](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/config/src/provider.ts#L5)

## Properties

### configNetworkKind?

> `optional` **configNetworkKind?**: `string`

Defined in: [packages/config/src/provider.ts:9](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/config/src/provider.ts#L9)

***

### executionMode?

> `optional` **executionMode?**: `string`

Defined in: [packages/config/src/provider.ts:10](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/config/src/provider.ts#L10)

***

### network

> **network**: `string`

Defined in: [packages/config/src/provider.ts:6](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/config/src/provider.ts#L6)

***

### networkRpcUrl?

> `optional` **networkRpcUrl?**: `string`

Defined in: [packages/config/src/provider.ts:16](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/config/src/provider.ts#L16)

WORKSPACE-AUTHORITY-2 (closeout): the endpoint the resolved network declares (`resolveWorkspaceExecution(...).rpcUrl`).
An explicit `url` still wins; without one, a declared endpoint is the destination — the canonical localnet is the
default of the localnet mode only when the network declares none, never a substitute for what it declares.

***

### provider?

> `optional` **provider?**: `string`

Defined in: [packages/config/src/provider.ts:7](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/config/src/provider.ts#L7)

***

### url?

> `optional` **url?**: `string`

Defined in: [packages/config/src/provider.ts:8](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/config/src/provider.ts#L8)
