[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / AddressHistoryResult

# Interface: AddressHistoryResult

Defined in: packages/query/dist/index.d.ts:1014

## Properties

### address

> `readonly` **address**: `string`

Defined in: packages/query/dist/index.d.ts:1016

***

### coverage

> `readonly` **coverage**: [`AddressHistoryCoverage`](AddressHistoryCoverage.md)

Defined in: packages/query/dist/index.d.ts:1027

***

### entries

> `readonly` **entries**: readonly [`AddressHistoryEntry`](AddressHistoryEntry.md)[]

Defined in: packages/query/dist/index.d.ts:1019

This page: oldest acceptance first; workspace records with no known acceptance last.

***

### networkId

> `readonly` **networkId**: `string`

Defined in: packages/query/dist/index.d.ts:1017

***

### page

> `readonly` **page**: `object`

Defined in: packages/query/dist/index.d.ts:1022

#### limit

> `readonly` **limit**: `number`

#### nextCursor?

> `readonly` `optional` **nextCursor?**: `string`

#### offset

> `readonly` **offset**: `number`

***

### schema

> `readonly` **schema**: `"hardkas.addressHistory.v1"`

Defined in: packages/query/dist/index.d.ts:1015

***

### total

> `readonly` **total**: `number`

Defined in: packages/query/dist/index.d.ts:1021

Entries in the whole window (and the workspace's records), over every page.
