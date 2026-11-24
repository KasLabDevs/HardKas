[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / createUtxoContext

# Function: createUtxoContext()

> **createUtxoContext**(`input`): `Promise`\<[`UtxoContextHandle`](../interfaces/UtxoContextHandle.md)\>

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:219](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/kaspa-wallet-adapter.ts#L219)

Constructs `UtxoProcessor(rpc, networkId)` + `UtxoContext(processor)`,
starts the processor, and (if `addresses` is given) tracks them. The
processor is stopped when `handle.stop()` is called.

## Parameters

### input

[`CreateUtxoContextInput`](../interfaces/CreateUtxoContextInput.md)

## Returns

`Promise`\<[`UtxoContextHandle`](../interfaces/UtxoContextHandle.md)\>
