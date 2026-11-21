[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / locateTransactionOnNode

# Function: locateTransactionOnNode()

> **locateTransactionOnNode**(`sdk`, `txId`, `address`, `options?`): `Promise`\<\{ `acceptance?`: [`AddressHistoryAcceptance`](../interfaces/AddressHistoryAcceptance.md); `coverage`: [`AddressHistoryCoverage`](../interfaces/AddressHistoryCoverage.md); `entry?`: [`AddressHistoryEntry`](../interfaces/AddressHistoryEntry.md); `found`: `boolean`; \}\>

Defined in: [packages/sdk/src/address-history.ts:58](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/address-history.ts#L58)

Where `txId` was accepted, found through the history of an address it pays or spends from (bounded; see `coverage`).

## Parameters

### sdk

[`AddressHistorySdk`](../interfaces/AddressHistorySdk.md)

### txId

`string`

### address

`string`

### options?

`Omit`\<[`SdkAddressHistoryOptions`](../interfaces/SdkAddressHistoryOptions.md), `"limit"` \| `"cursor"` \| `"workspaceRecords"`\> = `{}`

## Returns

`Promise`\<\{ `acceptance?`: [`AddressHistoryAcceptance`](../interfaces/AddressHistoryAcceptance.md); `coverage`: [`AddressHistoryCoverage`](../interfaces/AddressHistoryCoverage.md); `entry?`: [`AddressHistoryEntry`](../interfaces/AddressHistoryEntry.md); `found`: `boolean`; \}\>
