[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / AddressHistoryWindow

# Interface: AddressHistoryWindow

Defined in: packages/query/dist/index.d.ts:940

## Properties

### chainBlocks

> `readonly` **chainBlocks**: `number`

Defined in: packages/query/dist/index.d.ts:959

***

### clampedToPruningPoint

> `readonly` **clampedToPruningPoint**: `boolean`

Defined in: packages/query/dist/index.d.ts:965

A start below the pruning point (asked for) was moved up to it.

***

### continueFrom?

> `readonly` `optional` **continueFrom?**: `string`

Defined in: packages/query/dist/index.d.ts:972

When the window did not reach the tip: pass it as `since` to read the next window.

***

### firstCoveredDaaScore

> `readonly` **firstCoveredDaaScore**: `string`

Defined in: packages/query/dist/index.d.ts:953

The lowest DAA score a covered acceptance can have (from.daaScore + 1).

***

### from

> `readonly` **from**: `object`

Defined in: packages/query/dist/index.d.ts:948

The window starts AFTER this chain block: it covers the transactions accepted by the chain blocks that follow it.

#### daaScore

> `readonly` **daaScore**: `string`

#### hash

> `readonly` **hash**: `string`

***

### pruningPoint

> `readonly` **pruningPoint**: `object`

Defined in: packages/query/dist/index.d.ts:973

#### daaScore

> `readonly` **daaScore**: `string`

#### hash

> `readonly` **hash**: `string`

#### isGenesis

> `readonly` **isGenesis**: `boolean`

***

### reachedTip

> `readonly` **reachedTip**: `boolean`

Defined in: packages/query/dist/index.d.ts:961

The node had no chain block after the last one read.

***

### requested

> `readonly` **requested**: `object`

Defined in: packages/query/dist/index.d.ts:942

What the caller asked for.

#### kind

> `readonly` **kind**: `"default"` \| `"daaScore"` \| `"cursor"` \| `"block"`

#### lookback?

> `readonly` `optional` **lookback?**: `number`

#### value?

> `readonly` `optional` **value?**: `string`

***

### requestedStartNotReached

> `readonly` **requestedStartNotReached**: `boolean`

Defined in: packages/query/dist/index.d.ts:967

The requested start (a DAA score, or the lookback) was not reached within the walk bound or the deadline: the window starts later.

***

### startOffSelectedChain

> `readonly` **startOffSelectedChain**: `boolean`

Defined in: packages/query/dist/index.d.ts:969

The start block was not on the node's selected chain: the window starts at its selected-chain ancestor.

***

### startsAtPruningPoint

> `readonly` **startsAtPruningPoint**: `boolean`

Defined in: packages/query/dist/index.d.ts:963

The window starts at the node's pruning point: nothing older is readable on this node.

***

### stoppedBy

> `readonly` **stoppedBy**: `"tip"` \| `"max-chain-blocks"` \| `"deadline"` \| `"read-failed"` \| `"page-end"`

Defined in: packages/query/dist/index.d.ts:970

***

### to?

> `readonly` `optional` **to?**: `object`

Defined in: packages/query/dist/index.d.ts:955

The last chain block read (absent when none was).

#### daaScore

> `readonly` **daaScore**: `string`

#### hash

> `readonly` **hash**: `string`
