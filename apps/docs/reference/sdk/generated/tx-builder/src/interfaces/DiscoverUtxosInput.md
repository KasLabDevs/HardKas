[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / DiscoverUtxosInput

# Interface: DiscoverUtxosInput

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:345](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/kaspa-wallet-adapter.ts#L345)

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

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:348](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/kaspa-wallet-adapter.ts#L348)

***

### includeImmatureCoinbase?

> `readonly` `optional` **includeImmatureCoinbase?**: `boolean`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:350](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/kaspa-wallet-adapter.ts#L350)

When true, skip the mature-only filter and return all UTXOs (mature + immature coinbases).

***

### networkId

> `readonly` **networkId**: `string`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:347](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/kaspa-wallet-adapter.ts#L347)

***

### wasmRpc

> `readonly` **wasmRpc**: `any`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:346](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/kaspa-wallet-adapter.ts#L346)
