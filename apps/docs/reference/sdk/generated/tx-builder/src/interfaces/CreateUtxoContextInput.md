[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / CreateUtxoContextInput

# Interface: CreateUtxoContextInput

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:173](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/kaspa-wallet-adapter.ts#L173)

## Properties

### addresses?

> `readonly` `optional` **addresses?**: readonly `any`[]

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:176](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/kaspa-wallet-adapter.ts#L176)

***

### beforeResnapshot?

> `readonly` `optional` **beforeResnapshot?**: () => `Promise`\<`void`\>

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:184](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/kaspa-wallet-adapter.ts#L184)

A4 (audit 2026-11-13): runs before every post-reconnect re-snapshot, before the context is cleared or any address is read
from the node again. It throws to refuse the re-snapshot (e.g. the node behind the URL now serves another network):
nothing is read, and the failure goes to `onError` listeners.

#### Returns

`Promise`\<`void`\>

***

### id?

> `readonly` `optional` **id?**: `string`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:178](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/kaspa-wallet-adapter.ts#L178)

Optional 32-byte hex id for the UtxoContext. If omitted, upstream generates one.

***

### networkId

> `readonly` **networkId**: `string`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:175](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/kaspa-wallet-adapter.ts#L175)

***

### resnapshotTimeoutMs?

> `readonly` `optional` **resnapshotTimeoutMs?**: `number`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:192](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/kaspa-wallet-adapter.ts#L192)

The longest one call of a post-reconnect re-snapshot (`clear()`, `trackAddresses()`) may take, and the longest
`stop()` waits for a re-snapshot in flight, in ms (default 120 000). A node that keeps the socket open and stops
answering used to hold the re-snapshot for ever: every later reconnect was skipped and `stop()` never returned.
Past the bound the pass fails with `KASPA_WALLET_ADAPTER_RESNAPSHOT_TIMEOUT` (to `onError`) and the next reconnect
re-snapshots again; `stop()` goes on and stops the processor. The abandoned call is not cancelled.

***

### wasmRpc

> `readonly` **wasmRpc**: `any`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:174](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/kaspa-wallet-adapter.ts#L174)
