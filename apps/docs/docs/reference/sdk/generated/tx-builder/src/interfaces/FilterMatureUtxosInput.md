[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / FilterMatureUtxosInput

# Interface: FilterMatureUtxosInput

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:347](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L347)

Pure filter over an already-fetched UTXO list, using **upstream** coinbase
maturity (`k.getNetworkParams(networkId).coinbaseTransactionMaturityPeriodDaa`).
Callers can supply UTXOs from any RPC client (@hardkas/kaspa-rpc,
wasm RpcClient, or a mock) — this function only classifies.

Replaces the HardKAS pattern `!u.isCoinbase || u.blockDaaScore + N < virt`
with hardcoded `N` (600/100/1000). N is read from upstream network params.

## Properties

### networkId

> `readonly` **networkId**: `string`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:348](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L348)

***

### readEntry?

> `readonly` `optional` **readEntry?**: (`u`) => `object`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:352](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L352)

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

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:350](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L350)

***

### virtualDaaScore

> `readonly` **virtualDaaScore**: `bigint`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:349](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L349)
