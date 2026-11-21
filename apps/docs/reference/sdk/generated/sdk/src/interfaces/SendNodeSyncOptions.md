[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / SendNodeSyncOptions

# Interface: SendNodeSyncOptions

Defined in: [packages/sdk/src/send-node-sync.ts:22](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/send-node-sync.ts#L22)

The options of tx.send this check reads.

## Properties

### allowUnsyncedNode?

> `optional` **allowUnsyncedNode?**: `boolean`

Defined in: [packages/sdk/src/send-node-sync.ts:28](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/send-node-sync.ts#L28)

RC1 · D3: send to a node that does not say it is synced. Only for a controlled local network (simnet or devnet);
refused (SEND_UNSYNCED_NODE_NOT_ALLOWED) on any other network. Default false: such a node is refused
(NODE_NOT_SYNCED) before anything is sent or recorded.
