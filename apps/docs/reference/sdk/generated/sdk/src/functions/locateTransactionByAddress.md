[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / locateTransactionByAddress

# Function: locateTransactionByAddress()

> **locateTransactionByAddress**(`rpc`, `options`): `Promise`\<\{ `acceptance?`: [`AddressHistoryAcceptance`](../interfaces/AddressHistoryAcceptance.md); `coverage`: [`AddressHistoryCoverage`](../interfaces/AddressHistoryCoverage.md); `entry?`: [`AddressHistoryEntry`](../interfaces/AddressHistoryEntry.md); `found`: `boolean`; \}\>

Defined in: packages/query/dist/index.d.ts:1049

R3-D item 3 · where the acceptance of `txId` is, found through the history of an address it pays or spends from: its
accepting chain block and the chain block before it (a cursor that precedes the acceptance, for the observer).
`found: false` says which window was read; it is never an absence beyond that window.

## Parameters

### rpc

[`AddressHistoryRpc`](../interfaces/AddressHistoryRpc.md)

### options

`Omit`\<[`AddressHistoryOptions`](../interfaces/AddressHistoryOptions.md), `"workspaceRoot"` \| `"limit"` \| `"cursor"`\> & `object`

## Returns

`Promise`\<\{ `acceptance?`: [`AddressHistoryAcceptance`](../interfaces/AddressHistoryAcceptance.md); `coverage`: [`AddressHistoryCoverage`](../interfaces/AddressHistoryCoverage.md); `entry?`: [`AddressHistoryEntry`](../interfaces/AddressHistoryEntry.md); `found`: `boolean`; \}\>
