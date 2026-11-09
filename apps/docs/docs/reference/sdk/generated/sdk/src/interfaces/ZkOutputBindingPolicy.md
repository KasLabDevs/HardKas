[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkOutputBindingPolicy

# Interface: ZkOutputBindingPolicy

Defined in: [packages/sdk/src/zk/toccata.ts:232](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L232)

## Properties

### change?

> `optional` **change?**: [`ZkOutputTarget`](ZkOutputTarget.md)

Defined in: [packages/sdk/src/zk/toccata.ts:235](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L235)

***

### maxFeeSompi?

> `optional` **maxFeeSompi?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:241](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L241)

The most the lock may pay as fee. The redeem script refuses an input holding more than the bound outputs plus
this amount, so a larger deposit cannot be burnt as fee by whoever triggers the spend. Default
DEFAULT_MAX_FEE_CAP_SOMPI.

***

### mode

> **mode**: [`ZkBindingMode`](../type-aliases/ZkBindingMode.md)

Defined in: [packages/sdk/src/zk/toccata.ts:233](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L233)

***

### payout

> **payout**: [`ZkOutputTarget`](ZkOutputTarget.md)

Defined in: [packages/sdk/src/zk/toccata.ts:234](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L234)

***

### ~~utxoBinding?~~

> `optional` **utxoBinding?**: [`ZkReplayBinding`](ZkReplayBinding.md)

Defined in: [packages/sdk/src/zk/toccata.ts:247](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L247)

#### Deprecated

Refused (ZK_UTXO_BINDING_UNSATISFIABLE): binding the spent outpoint is circular. The funding
transaction's id commits to its outputs, this P2SH among them, so no redeem script can name that outpoint in
advance; a lock that did would be unspendable. Replay across UTXOs is limited by the one-input rule instead.
