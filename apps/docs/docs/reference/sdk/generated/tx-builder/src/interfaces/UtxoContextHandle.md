[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / UtxoContextHandle

# Interface: UtxoContextHandle

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:154](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L154)

UtxoContext lifecycle handle. Wraps a `UtxoProcessor` and a `UtxoContext`,
tracks the given addresses, and exposes mature/pending/balance directly from
upstream. Callers are responsible for calling `stop()` on teardown.

Requires an already-connected wasm `RpcClient` (obtain it from your own
caller code; this adapter does not open connections).

Reconnects: kaspa-wasm's `UtxoContext.clear()` must be called when the node connection
comes back, followed by re-registering the addresses, or the context keeps a stale view
(Surface Cut 3b: resubscribing alone kept the inputs spent while disconnected and missed
the change). The handle does that on every reconnect: `clear()` → `trackAddresses()` on
the tracked addresses, one re-snapshot at a time; reconnects that arrive meanwhile are
merged into one more pass, and after `stop()` nothing is registered again.

## Properties

### context

> `readonly` **context**: `any`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:155](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L155)

***

### processor

> `readonly` **processor**: `any`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:156](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L156)

***

### resyncing

> `readonly` **resyncing**: `boolean`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:158](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L158)

True while a post-reconnect re-snapshot is running; the context is not a complete view then.

## Methods

### balance()

> **balance**(): `any`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:163](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L163)

#### Returns

`any`

***

### clear()

> **clear**(): `Promise`\<`void`\>

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:165](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L165)

#### Returns

`Promise`\<`void`\>

***

### matureLength()

> **matureLength**(): `number`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:164](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L164)

#### Returns

`number`

***

### matureRange()

> **matureRange**(`from`, `to`): `any`[]

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:161](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L161)

#### Parameters

##### from

`number`

##### to

`number`

#### Returns

`any`[]

***

### onError()

> **onError**(`listener`): () => `void`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:169](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L169)

Called when a re-snapshot fails; the next reconnect re-snapshots again. Returns an unsubscribe.

#### Parameters

##### listener

(`error`) => `void`

#### Returns

() => `void`

***

### onResync()

> **onResync**(`listener`): () => `void`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:167](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L167)

Called once after a completed re-snapshot (merged reconnects give one call). Returns an unsubscribe.

#### Parameters

##### listener

() => `void`

#### Returns

() => `void`

***

### pending()

> **pending**(): `any`[]

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:162](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L162)

#### Returns

`any`[]

***

### stop()

> **stop**(): `Promise`\<`void`\>

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:170](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L170)

#### Returns

`Promise`\<`void`\>

***

### trackAddresses()

> **trackAddresses**(`addresses`): `Promise`\<`void`\>

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:159](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L159)

#### Parameters

##### addresses

readonly `any`[]

#### Returns

`Promise`\<`void`\>

***

### unregisterAddresses()

> **unregisterAddresses**(`addresses`): `Promise`\<`void`\>

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:160](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L160)

#### Parameters

##### addresses

readonly `any`[]

#### Returns

`Promise`\<`void`\>
