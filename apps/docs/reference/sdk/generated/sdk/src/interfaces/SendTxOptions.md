[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / SendTxOptions

# Interface: SendTxOptions

Defined in: [packages/sdk/src/tx.ts:167](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L167)

Options of `tx.send` given as an object (the string form is the endpoint alone).

## Properties

### allowUnplannedSignedTransaction?

> `optional` **allowUnplannedSignedTransaction?**: `boolean`

Defined in: [packages/sdk/src/tx.ts:203](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L203)

HK-11 · explicit, documented escape: send a signed payment that names NO plan (its lineage has no
`parentArtifactId` — a transaction signed outside this workspace's plan → sign flow). By default a real send
requires the plan that authorized the transaction (SEND_PLAN_UNRESOLVED otherwise). With this option HardKAS
cannot compare the signed transaction with any plan (no SIGNED_PLAN_MISMATCH) nor derive its fee, so no fee limit
can be checked: you take both on yourself; the submission records `fee: insufficient-evidence`. It never covers a
parent that is named but is not a plan (SEND_PARENT_NOT_PLAN), a v1 transaction (V1_SEND_PLAN_UNRESOLVED), or the
preflight (which needs the plan). Never on mainnet (MAINNET_UNPLANNED_SEND_REFUSED, a permanent rule that lifting the
mainnet lockdown does not lift). Default false.

***

### allowUnsyncedNode?

> `optional` **allowUnsyncedNode?**: `boolean`

Defined in: [packages/sdk/src/tx.ts:210](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L210)

RC1 · D3 · explicit, documented escape for a controlled local network only: send to a node that does not say it is
synced. By default a real send asks the node (getServerInfo) before anything else and refuses one that does not
say `isSynced: true` (NODE_NOT_SYNCED; nothing is sent or recorded), as the CLI does. Allowed on simnet and devnet
only (SEND_UNSYNCED_NODE_NOT_ALLOWED elsewhere); never implied by another option; mainnet stays disabled. Default false.

***

### persist?

> `optional` **persist?**: `boolean`

Defined in: [packages/sdk/src/tx.ts:171](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L171)

Simulator: write the receipt (default true).

***

### plan?

> `optional` **plan?**: [`TxPlanArtifact`](TxPlanArtifact.md)

Defined in: [packages/sdk/src/tx.ts:176](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L176)

Simulator: the signed artifact's plan, when the store does not hold it (used only if its recomputed identity is the
signed artifact's lineage parent). A real send reads the plan from the workspace store only.

***

### preflight?

> `optional` **preflight?**: `boolean`

Defined in: [packages/sdk/src/tx.ts:192](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L192)

PAYMENT-PREFLIGHT-1 · opt-in, for a payment (not a v1 engine transaction, which always runs its own check): right
before the broadcast, read-only, the node is asked for every input (unspent, as the plan states it, no covenant id,
not pending in its mempool) and each input's Schnorr signature (SIGHASH_ALL) is verified for the transaction sent
against the node's UTXO entry. Anything it cannot verify refuses the send; nothing is sent or recorded then. The
submission records the check (`preflight`). One node's view, not a consensus validation. Default false: unchanged.

***

### replacePendingTransition?

> `optional` **replacePendingTransition?**: `string` \| readonly `string`[]

Defined in: [packages/sdk/src/tx.ts:182](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L182)

F1.6 · explicit replacement of a pending transition of the same covenant: the artifactId(s) of its recorded
submission(s). Allowed only for a transaction that spends one of the replaced transition's covenant outpoints; the
new record names what it replaced. Never automatic.

***

### url?

> `optional` **url?**: `string`

Defined in: [packages/sdk/src/tx.ts:169](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L169)

The endpoint to send to: it must be this instance's client's (ENDPOINT-AUTHORITY-1).

***

### v1Facts?

> `optional` **v1Facts?**: `V1EngineFacts`

Defined in: [packages/sdk/src/tx.ts:184](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L184)

F1.6 · where a v1 send gets its contract facts (default: this workspace's compile records and the pinned silverc).
