[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkOutputBindingPolicy

# Interface: ZkOutputBindingPolicy

Defined in: [packages/sdk/src/zk/toccata.ts:256](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L256)

## Properties

### change?

> `optional` **change?**: [`ZkOutputTarget`](ZkOutputTarget.md)

Defined in: [packages/sdk/src/zk/toccata.ts:259](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L259)

***

### maxFeeSompi?

> `optional` **maxFeeSompi?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:265](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L265)

The most the lock may pay as fee. The redeem script refuses an input holding more than the bound outputs plus
this amount, so a larger deposit cannot be burnt as fee by whoever triggers the spend. Default
DEFAULT_MAX_FEE_CAP_SOMPI.

***

### mode

> **mode**: [`ZkBindingMode`](../type-aliases/ZkBindingMode.md)

Defined in: [packages/sdk/src/zk/toccata.ts:257](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L257)

***

### payout

> **payout**: [`ZkOutputTarget`](ZkOutputTarget.md)

Defined in: [packages/sdk/src/zk/toccata.ts:258](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L258)

***

### ~~utxoBinding?~~

> `optional` **utxoBinding?**: [`ZkReplayBinding`](ZkReplayBinding.md)

Defined in: [packages/sdk/src/zk/toccata.ts:271](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L271)

#### Deprecated

Refused (ZK_UTXO_BINDING_UNSATISFIABLE): binding the spent outpoint is circular. The funding
transaction's id commits to its outputs, this P2SH among them, so no redeem script can name that outpoint in
advance; a lock that did would be unspendable. Replay across UTXOs is limited by the one-input rule instead.
