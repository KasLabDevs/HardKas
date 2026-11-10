[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / PendingSpendEvidence

# Interface: PendingSpendEvidence

Defined in: [packages/tx-builder/src/pending-spends.ts:14](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/pending-spends.ts#L14)

## Properties

### address

> **address**: `string`

Defined in: [packages/tx-builder/src/pending-spends.ts:17](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/pending-spends.ts#L17)

***

### excludedOutpoints

> **excludedOutpoints**: `string`[]

Defined in: [packages/tx-builder/src/pending-spends.ts:23](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/pending-spends.ts#L23)

Outpoints (`txId:index`) excluded from coin selection, sorted.

***

### guarantee

> **guarantee**: `"local-orchestration-only: outpoints spent by transactions in the observer's mempool at the observation point were excluded; absence from that mempool does not prove absence of a competing spend on the network"`

Defined in: [packages/tx-builder/src/pending-spends.ts:24](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/pending-spends.ts#L24)

***

### observedAtDaaScore?

> `optional` **observedAtDaaScore?**: `string`

Defined in: [packages/tx-builder/src/pending-spends.ts:19](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/pending-spends.ts#L19)

The observer's virtual DAA score when the snapshot was read (recency anchor), when known.

***

### scope

> **scope**: `"observer-local"`

Defined in: [packages/tx-builder/src/pending-spends.ts:16](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/pending-spends.ts#L16)

***

### sendingEntries

> **sendingEntries**: `number`

Defined in: [packages/tx-builder/src/pending-spends.ts:21](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/pending-spends.ts#L21)

Mempool transactions sending FROM `address` that were inspected.

***

### source

> **source**: `"mempool"`

Defined in: [packages/tx-builder/src/pending-spends.ts:15](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/pending-spends.ts#L15)
