[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / SdkAddressHistoryOptions

# Interface: SdkAddressHistoryOptions

Defined in: [packages/sdk/src/address-history.ts:23](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/address-history.ts#L23)

## Extends

- `Omit`\<[`AddressHistoryOptions`](AddressHistoryOptions.md), `"address"` \| `"networkId"` \| `"workspaceRoot"`\>

## Properties

### cursor?

> `readonly` `optional` **cursor?**: `string`

Defined in: packages/query/dist/index.d.ts:870

A page cursor from a previous result (`page.nextCursor`): the same window, the next entries.

#### Inherited from

[`AddressHistoryOptions`](AddressHistoryOptions.md).[`cursor`](AddressHistoryOptions.md#cursor)

***

### limit?

> `readonly` `optional` **limit?**: `number`

Defined in: packages/query/dist/index.d.ts:868

Entries per page (default 100, at most 1000).

#### Inherited from

[`AddressHistoryOptions`](AddressHistoryOptions.md).[`limit`](AddressHistoryOptions.md#limit)

***

### lookback?

> `readonly` `optional` **lookback?**: `number`

Defined in: packages/query/dist/index.d.ts:864

The default window, in chain blocks back from the sink (default 1000).

#### Inherited from

[`AddressHistoryOptions`](AddressHistoryOptions.md).[`lookback`](AddressHistoryOptions.md#lookback)

***

### maxChainBlocks?

> `readonly` `optional` **maxChainBlocks?**: `number`

Defined in: packages/query/dist/index.d.ts:866

At most this many chain blocks walked back, and read forward, by this call (default 10000 each).

#### Inherited from

[`AddressHistoryOptions`](AddressHistoryOptions.md).[`maxChainBlocks`](AddressHistoryOptions.md#maxchainblocks)

***

### now?

> `readonly` `optional` **now?**: () => `number`

Defined in: packages/query/dist/index.d.ts:876

Test injection.

#### Returns

`number`

#### Inherited from

[`AddressHistoryOptions`](AddressHistoryOptions.md).[`now`](AddressHistoryOptions.md#now)

***

### since?

> `readonly` `optional` **since?**: `string` \| `number` \| `bigint`

Defined in: packages/query/dist/index.d.ts:862

Where the window starts: a chain block hash (64 hex: the transactions accepted by the chain blocks after it), or a
DAA score (decimal string, bigint or number: the transactions accepted by chain blocks at or above it). Default:
`lookback` chain blocks back from the node's sink. Never before the node's pruning point (a start below it is moved
up to it, and the coverage says so).

#### Inherited from

[`AddressHistoryOptions`](AddressHistoryOptions.md).[`since`](AddressHistoryOptions.md#since)

***

### timeoutMs?

> `readonly` `optional` **timeoutMs?**: `number`

Defined in: packages/query/dist/index.d.ts:872

One deadline for the whole read, in ms (default 60000).

#### Inherited from

[`AddressHistoryOptions`](AddressHistoryOptions.md).[`timeoutMs`](AddressHistoryOptions.md#timeoutms)

***

### workspaceRecords?

> `readonly` `optional` **workspaceRecords?**: `boolean`

Defined in: [packages/sdk/src/address-history.ts:25](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/address-history.ts#L25)

Merge this workspace's own records (submissions, receipts) into the history (default: true).
