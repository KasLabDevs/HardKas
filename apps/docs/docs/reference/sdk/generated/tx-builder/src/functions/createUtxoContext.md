[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / createUtxoContext

# Function: createUtxoContext()

> **createUtxoContext**(`input`): `Promise`\<[`UtxoContextHandle`](../interfaces/UtxoContextHandle.md)\>

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:186](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L186)

Constructs `UtxoProcessor(rpc, networkId)` + `UtxoContext(processor)`,
starts the processor, and (if `addresses` is given) tracks them. The
processor is stopped when `handle.stop()` is called.

## Parameters

### input

[`CreateUtxoContextInput`](../interfaces/CreateUtxoContextInput.md)

## Returns

`Promise`\<[`UtxoContextHandle`](../interfaces/UtxoContextHandle.md)\>
