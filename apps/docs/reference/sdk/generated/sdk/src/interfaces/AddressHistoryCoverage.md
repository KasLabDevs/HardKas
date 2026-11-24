[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / AddressHistoryCoverage

# Interface: AddressHistoryCoverage

Defined in: packages/query/dist/index.d.ts:979

## Properties

### inputsWithoutEntry

> `readonly` **inputsWithoutEntry**: `number`

Defined in: packages/query/dist/index.d.ts:987

***

### node

> `readonly` **node**: `object`

Defined in: packages/query/dist/index.d.ts:995

What the node said about itself (getServerInfo), when it answered.

#### isSynced?

> `readonly` `optional` **isSynced?**: `boolean`

#### networkId?

> `readonly` `optional` **networkId?**: `string`

#### serverVersion?

> `readonly` `optional` **serverVersion?**: `string`

***

### notCovered

> `readonly` **notCovered**: readonly `string`[]

Defined in: packages/query/dist/index.d.ts:1012

What this result does not cover, in words.

***

### point

> `readonly` **point**: `object`

Defined in: packages/query/dist/index.d.ts:989

The node's tip at the end of the read: the confirmations are measured from it.

#### sinkBlueScore

> `readonly` **sinkBlueScore**: `string`

#### sinkHash

> `readonly` **sinkHash**: `string`

#### virtualDaaScore

> `readonly` **virtualDaaScore**: `string`

***

### reads

> `readonly` **reads**: `object`

Defined in: packages/query/dist/index.d.ts:1006

#### getBlock

> `readonly` **getBlock**: `number`

#### getVirtualChainFromBlockV2

> `readonly` **getVirtualChainFromBlockV2**: `number`

#### other

> `readonly` **other**: `number`

***

### spends

> `readonly` **spends**: `"node-entries"` \| `"window-outputs-only"`

Defined in: packages/query/dist/index.d.ts:986

`node-entries`: every input read came with the node's spent entry (its address), so every spend in the window of an
output of the address is listed, whenever that output was created. `window-outputs-only`: some inputs came without
it; those can only be matched against outputs created at the address in the window (`inputsWithoutEntry`).

***

### window

> `readonly` **window**: [`AddressHistoryWindow`](AddressHistoryWindow.md)

Defined in: packages/query/dist/index.d.ts:980

***

### workspace

> `readonly` **workspace**: `object`

Defined in: packages/query/dist/index.d.ts:1000

#### merged

> `readonly` **merged**: `boolean`

#### outsideWindow

> `readonly` **outsideWindow**: `number`

#### records

> `readonly` **records**: `number`

#### rejected

> `readonly` **rejected**: `number`
