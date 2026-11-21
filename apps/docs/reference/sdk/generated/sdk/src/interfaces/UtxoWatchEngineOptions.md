[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / UtxoWatchEngineOptions

# Interface: UtxoWatchEngineOptions

Defined in: packages/toolkit/dist/watch.d.ts:67

The engine's options: its bounds, and what watchAddress adds (all off for WalletToolkit.watch()).

## Extends

- `UtxoWatchEngineTimeouts`

## Properties

### connectMs?

> `optional` **connectMs?**: `number`

Defined in: packages/toolkit/dist/watch.d.ts:49

#### Inherited from

`UtxoWatchEngineTimeouts.connectMs`

***

### onConnection?

> `optional` **onConnection?**: (`state`) => `void`

Defined in: packages/toolkit/dist/watch.d.ts:73

The connection went away (`disconnected`) or came back (`reconnected`: the re-snapshot follows, then a `resync`).

#### Parameters

##### state

`"disconnected"` \| `"reconnected"`

#### Returns

`void`

***

### onError?

> `optional` **onError?**: (`error`) => `void`

Defined in: packages/toolkit/dist/watch.d.ts:71

What the engine otherwise only logs: a failed or stalled re-snapshot, a node that changed its network (the watch then stops).

#### Parameters

##### error

`unknown`

#### Returns

`void`

***

### reportMaturity?

> `optional` **reportMaturity?**: `boolean`

Defined in: packages/toolkit/dist/watch.d.ts:69

Report `maturity` events.

***

### requestMs?

> `optional` **requestMs?**: `number`

Defined in: packages/toolkit/dist/watch.d.ts:50

#### Inherited from

`UtxoWatchEngineTimeouts.requestMs`

***

### snapshotMs?

> `optional` **snapshotMs?**: `number`

Defined in: packages/toolkit/dist/watch.d.ts:51

#### Inherited from

`UtxoWatchEngineTimeouts.snapshotMs`
