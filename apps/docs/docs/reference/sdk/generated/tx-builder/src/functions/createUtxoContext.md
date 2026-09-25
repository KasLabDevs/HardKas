[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / createUtxoContext

# Function: createUtxoContext()

> **createUtxoContext**(`input`): `Promise`\<[`UtxoContextHandle`](../interfaces/UtxoContextHandle.md)\>

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:140](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L140)

Constructs `UtxoProcessor(rpc, networkId)` + `UtxoContext(processor)`,
starts the processor, and (if `addresses` is given) tracks them. The
processor is stopped when `handle.stop()` is called.

## Parameters

### input

[`CreateUtxoContextInput`](../interfaces/CreateUtxoContextInput.md)

## Returns

`Promise`\<[`UtxoContextHandle`](../interfaces/UtxoContextHandle.md)\>
