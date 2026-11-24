[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / readAddressHistoryOnNode

# Function: readAddressHistoryOnNode()

> **readAddressHistoryOnNode**(`sdk`, `address`, `options?`): `Promise`\<[`AddressHistoryResult`](../interfaces/AddressHistoryResult.md)\>

Defined in: [packages/sdk/src/address-history.ts:50](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/address-history.ts#L50)

The history of `address` on this instance's node over a bounded window (see @hardkas/query `readAddressHistory`):
every transaction accepted in the window that pays the address or spends an output of it, deduplicated, paged, with
its depth; this workspace's own records merged in. Mainnet is refused before anything is read.

## Parameters

### sdk

[`AddressHistorySdk`](../interfaces/AddressHistorySdk.md)

### address

`string`

### options?

[`SdkAddressHistoryOptions`](../interfaces/SdkAddressHistoryOptions.md) = `{}`

## Returns

`Promise`\<[`AddressHistoryResult`](../interfaces/AddressHistoryResult.md)\>
