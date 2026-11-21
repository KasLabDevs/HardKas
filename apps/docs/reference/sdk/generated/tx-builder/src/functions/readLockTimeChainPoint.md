[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / readLockTimeChainPoint

# Function: readLockTimeChainPoint()

> **readLockTimeChainPoint**(`rpc`): `Promise`\<[`LockTimeChainPoint`](../interfaces/LockTimeChainPoint.md)\>

Defined in: [packages/tx-builder/src/lock-time.ts:258](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/lock-time.ts#L258)

Where a node is now, for a lock-time check: its getBlockDagInfo answer read through the generic `call` every HardKAS RPC
client exposes (the typed getBlockDagInfo of some clients drops the past median time), else through getBlockDagInfo.
Read-only. A failed read gives an empty point (the check then says LOCK_TIME_UNVERIFIABLE), never an invented one.

## Parameters

### rpc

#### call?

(`method`, `params?`) => `Promise`\<`unknown`\>

#### getBlockDagInfo?

() => `Promise`\<`unknown`\>

## Returns

`Promise`\<[`LockTimeChainPoint`](../interfaces/LockTimeChainPoint.md)\>
