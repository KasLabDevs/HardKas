[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / AddressHistoryAcceptance

# Interface: AddressHistoryAcceptance

Defined in: packages/query/dist/index.d.ts:897

## Properties

### blueScore

> `readonly` **blueScore**: `string`

Defined in: packages/query/dist/index.d.ts:900

***

### chainBlockHash

> `readonly` **chainBlockHash**: `string`

Defined in: packages/query/dist/index.d.ts:898

***

### confirmationsBlue

> `readonly` **confirmationsBlue**: `string`

Defined in: packages/query/dist/index.d.ts:906

Depth below the node's sink blue score at the end of the read (the unit of HardKAS's confirmation policy).

***

### confirmationsDaa

> `readonly` **confirmationsDaa**: `string`

Defined in: packages/query/dist/index.d.ts:904

Depth below the node's virtual DAA score at the end of the read.

***

### daaScore

> `readonly` **daaScore**: `string`

Defined in: packages/query/dist/index.d.ts:899

***

### previousChainBlockHash

> `readonly` **previousChainBlockHash**: `string`

Defined in: packages/query/dist/index.d.ts:902

The chain block before it on the selected chain, as read: a cursor that precedes this acceptance.
