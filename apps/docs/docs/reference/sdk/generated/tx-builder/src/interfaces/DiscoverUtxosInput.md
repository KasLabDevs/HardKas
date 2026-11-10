[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / DiscoverUtxosInput

# Interface: DiscoverUtxosInput

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:298](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L298)

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

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:301](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L301)

***

### includeImmatureCoinbase?

> `readonly` `optional` **includeImmatureCoinbase?**: `boolean`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:303](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L303)

When true, skip the mature-only filter and return all UTXOs (mature + immature coinbases).

***

### networkId

> `readonly` **networkId**: `string`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:300](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L300)

***

### wasmRpc

> `readonly` **wasmRpc**: `any`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:299](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-wallet-adapter.ts#L299)
