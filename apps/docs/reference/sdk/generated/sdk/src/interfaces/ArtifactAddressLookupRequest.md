[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ArtifactAddressLookupRequest

# Interface: ArtifactAddressLookupRequest

Defined in: [packages/sdk/src/artifact-network-verify.ts:202](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L202)

## Properties

### address

> `readonly` **address**: `string`

Defined in: [packages/sdk/src/artifact-network-verify.ts:203](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L203)

***

### lookback?

> `readonly` `optional` **lookback?**: `number`

Defined in: [packages/sdk/src/artifact-network-verify.ts:206](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L206)

***

### maxChainBlocks?

> `readonly` `optional` **maxChainBlocks?**: `number`

Defined in: [packages/sdk/src/artifact-network-verify.ts:207](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L207)

***

### since?

> `readonly` `optional` **since?**: `string` \| `number` \| `bigint`

Defined in: [packages/sdk/src/artifact-network-verify.ts:205](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L205)

The history's window start (a chain block hash or a DAA score); default: its last `lookback` chain blocks.

***

### timeoutMs?

> `readonly` `optional` **timeoutMs?**: `number`

Defined in: [packages/sdk/src/artifact-network-verify.ts:208](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L208)
