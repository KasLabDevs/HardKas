[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / DiscoverUtxosInput

# Interface: DiscoverUtxosInput

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:183](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L183)

One-shot UTXO discovery over a wasm RpcClient with **upstream-authoritative**
coinbase-maturity filtering (via `k.getNetworkParams(networkId)`). Replaces
the HardKAS pattern of calling `rpc.getUtxosByAddress(addr)` + filtering
`!u.isCoinbase || u.blockDaaScore + N < virt` with an inlined maturity `N`.

Prefer [createUtxoContext](../functions/createUtxoContext.md) when the caller needs live UTXO tracking
(mature/pending) and event notifications. Use this helper only for a single
synchronous read.

## Properties

### address

> `readonly` **address**: `string`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:186](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L186)

***

### includeImmatureCoinbase?

> `readonly` `optional` **includeImmatureCoinbase?**: `boolean`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:188](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L188)

When true, skip the mature-only filter and return all UTXOs (mature + immature coinbases).

***

### networkId

> `readonly` **networkId**: `string`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:185](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L185)

***

### wasmRpc

> `readonly` **wasmRpc**: `any`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:184](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L184)
