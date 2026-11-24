[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / AddressHistoryOptions

# Interface: AddressHistoryOptions

Defined in: packages/query/dist/index.d.ts:852

## Properties

### address

> `readonly` **address**: `string`

Defined in: packages/query/dist/index.d.ts:853

***

### cursor?

> `readonly` `optional` **cursor?**: `string`

Defined in: packages/query/dist/index.d.ts:870

A page cursor from a previous result (`page.nextCursor`): the same window, the next entries.

***

### limit?

> `readonly` `optional` **limit?**: `number`

Defined in: packages/query/dist/index.d.ts:868

Entries per page (default 100, at most 1000).

***

### lookback?

> `readonly` `optional` **lookback?**: `number`

Defined in: packages/query/dist/index.d.ts:864

The default window, in chain blocks back from the sink (default 1000).

***

### maxChainBlocks?

> `readonly` `optional` **maxChainBlocks?**: `number`

Defined in: packages/query/dist/index.d.ts:866

At most this many chain blocks walked back, and read forward, by this call (default 10000 each).

***

### networkId

> `readonly` **networkId**: `string`

Defined in: packages/query/dist/index.d.ts:855

The network the caller reads as (declared; never adopted from the node). Mainnet is refused before any read.

***

### now?

> `readonly` `optional` **now?**: () => `number`

Defined in: packages/query/dist/index.d.ts:876

Test injection.

#### Returns

`number`

***

### since?

> `readonly` `optional` **since?**: `string` \| `number` \| `bigint`

Defined in: packages/query/dist/index.d.ts:862

Where the window starts: a chain block hash (64 hex: the transactions accepted by the chain blocks after it), or a
DAA score (decimal string, bigint or number: the transactions accepted by chain blocks at or above it). Default:
`lookback` chain blocks back from the node's sink. Never before the node's pruning point (a start below it is moved
up to it, and the coverage says so).

***

### timeoutMs?

> `readonly` `optional` **timeoutMs?**: `number`

Defined in: packages/query/dist/index.d.ts:872

One deadline for the whole read, in ms (default 60000).

***

### workspaceRoot?

> `readonly` `optional` **workspaceRoot?**: `string`

Defined in: packages/query/dist/index.d.ts:874

The workspace whose own records (submissions, receipts and their plans) are merged in.
