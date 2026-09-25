[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / WatcherOptions

# Interface: WatcherOptions

Defined in: [packages/artifacts/src/invariants/watcher.ts:17](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/watcher.ts#L17)

## Properties

### artifactStore?

> `optional` **artifactStore?**: [`ArtifactLookup`](ArtifactLookup.md)

Defined in: [packages/artifacts/src/invariants/watcher.ts:23](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/watcher.ts#L23)

***

### eventBus

> **eventBus**: `object`

Defined in: [packages/artifacts/src/invariants/watcher.ts:19](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/watcher.ts#L19)

#### emit()

> **emit**(`event`): `void`

##### Parameters

###### event

`EventEnvelope`

##### Returns

`void`

#### subscribe()

> **subscribe**(`callback`): () => `void`

##### Parameters

###### callback

(`event`) => `void`

##### Returns

() => `void`

***

### invariants

> **invariants**: [`Invariant`](Invariant.md)[]

Defined in: [packages/artifacts/src/invariants/watcher.ts:18](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/watcher.ts#L18)
