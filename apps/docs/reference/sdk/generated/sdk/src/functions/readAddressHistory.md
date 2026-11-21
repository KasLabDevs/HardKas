[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / readAddressHistory

# Function: readAddressHistory()

> **readAddressHistory**(`rpc`, `options`): `Promise`\<[`AddressHistoryResult`](../interfaces/AddressHistoryResult.md)\>

Defined in: packages/query/dist/index.d.ts:1043

The history of `address` over a window of the node's selected chain, one page of it (see the module comment). Throws
only before the window is known; once reading, a deadline or the read bound ends the window early, and the coverage
says where. `page.nextCursor` gives the next page of the same window.

## Parameters

### rpc

[`AddressHistoryRpc`](../interfaces/AddressHistoryRpc.md)

### options

[`AddressHistoryOptions`](../interfaces/AddressHistoryOptions.md)

## Returns

`Promise`\<[`AddressHistoryResult`](../interfaces/AddressHistoryResult.md)\>
