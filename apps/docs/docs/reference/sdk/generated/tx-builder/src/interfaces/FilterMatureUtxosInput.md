[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / FilterMatureUtxosInput

# Interface: FilterMatureUtxosInput

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:234](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L234)

Pure filter over an already-fetched UTXO list, using **upstream** coinbase
maturity (`k.getNetworkParams(networkId).coinbaseTransactionMaturityPeriod`
or equivalent). Callers can supply UTXOs from any RPC client (@hardkas/kaspa-rpc,
wasm RpcClient, or a mock) — this function only classifies.

Replaces the HardKAS pattern `!u.isCoinbase || u.blockDaaScore + N < virt`
with hardcoded `N` (600/100/1000). N is read from upstream network params.

## Properties

### networkId

> `readonly` **networkId**: `string`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:235](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L235)

***

### readEntry?

> `readonly` `optional` **readEntry?**: (`u`) => `object`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:239](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L239)

How to read the score / coinbase flag from each element. Defaults to `utxoEntry` wrapper shape.

#### Parameters

##### u

`any`

#### Returns

`object`

##### blockDaaScore

> **blockDaaScore**: `bigint`

##### isCoinbase

> **isCoinbase**: `boolean`

***

### utxos

> `readonly` **utxos**: readonly `any`[]

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:237](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L237)

***

### virtualDaaScore

> `readonly` **virtualDaaScore**: `bigint`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:236](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L236)
