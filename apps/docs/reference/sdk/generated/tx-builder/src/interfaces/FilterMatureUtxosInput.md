[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / FilterMatureUtxosInput

# Interface: FilterMatureUtxosInput

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:394](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/kaspa-wallet-adapter.ts#L394)

Pure filter over an already-fetched UTXO list, using **upstream** coinbase
maturity (`k.getNetworkParams(networkId).coinbaseTransactionMaturityPeriodDaa`).
Callers can supply UTXOs from any RPC client (@hardkas/kaspa-rpc,
wasm RpcClient, or a mock) — this function only classifies.

Replaces the HardKAS pattern `!u.isCoinbase || u.blockDaaScore + N < virt`
with hardcoded `N` (600/100/1000). N is read from upstream network params.

## Properties

### networkId

> `readonly` **networkId**: `string`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:395](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/kaspa-wallet-adapter.ts#L395)

***

### readEntry?

> `readonly` `optional` **readEntry?**: (`u`) => `object`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:399](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/kaspa-wallet-adapter.ts#L399)

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

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:397](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/kaspa-wallet-adapter.ts#L397)

***

### virtualDaaScore

> `readonly` **virtualDaaScore**: `bigint`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:396](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/kaspa-wallet-adapter.ts#L396)
