[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / watchAddress

# Function: watchAddress()

> **watchAddress**(`rpcUrl`, `address`, `listener`, `options?`): `Promise`\<[`AddressWatchHandle`](../interfaces/AddressWatchHandle.md)\>

Defined in: packages/toolkit/dist/watch.d.ts:166

WATCH-CLI-1 · watches ANY address (WalletToolkit.watch() watches its own wallet's) with the same engine: kaspa-wasm's
UtxoProcessor + UtxoContext, a re-snapshot (`resync`) after every reconnect, every reconnection identified again.
Refused before any connection: a mainnet address (MAINNET_CONNECTION_DISABLED). After the node's first answer: a node
that says mainnet (the engine's own refusal), a node of another network than `expectedNetworkId`
(WATCH_NODE_NETWORK_MISMATCH), an address of another network than the node's (WATCH_ADDRESS_NETWORK_MISMATCH); nothing
is tracked then. Events: `transaction` (outputs added or removed), `resync`, and `maturity` with `reportMaturity`.

## Parameters

### rpcUrl

`string`

### address

`string`

### listener

[`AddressWatchListener`](../type-aliases/AddressWatchListener.md)

### options?

[`UtxoWatchEngineOptions`](../interfaces/UtxoWatchEngineOptions.md) & `object`

## Returns

`Promise`\<[`AddressWatchHandle`](../interfaces/AddressWatchHandle.md)\>
