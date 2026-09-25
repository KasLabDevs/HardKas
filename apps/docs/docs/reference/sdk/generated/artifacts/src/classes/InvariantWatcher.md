[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / InvariantWatcher

# Class: InvariantWatcher

Defined in: [packages/artifacts/src/invariants/watcher.ts:31](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/watcher.ts#L31)

Lightweight, opt-in watcher for system invariants.
Listens to the event bus and performs validation.
Non-global, non-singleton.

## Constructors

### Constructor

> **new InvariantWatcher**(`options`): `InvariantWatcher`

Defined in: [packages/artifacts/src/invariants/watcher.ts:37](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/watcher.ts#L37)

#### Parameters

##### options

[`WatcherOptions`](../interfaces/WatcherOptions.md)

#### Returns

`InvariantWatcher`

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [packages/artifacts/src/invariants/watcher.ts:94](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/watcher.ts#L94)

Alias for stop().

#### Returns

`void`

***

### start()

> **start**(): `void`

Defined in: [packages/artifacts/src/invariants/watcher.ts:46](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/watcher.ts#L46)

Starts watching for events.

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [packages/artifacts/src/invariants/watcher.ts:84](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/watcher.ts#L84)

Stops watching and clears subscriptions.

#### Returns

`void`
