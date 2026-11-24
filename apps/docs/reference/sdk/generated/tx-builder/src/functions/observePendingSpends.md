[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / observePendingSpends

# Function: observePendingSpends()

> **observePendingSpends**(`rpc`, `address`, `observedAtDaaScore?`): `Promise`\<\{ `evidence`: [`PendingSpendEvidence`](../interfaces/PendingSpendEvidence.md); `outpoints`: `Set`\<`string`\>; \}\>

Defined in: [packages/tx-builder/src/pending-spends.ts:98](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/pending-spends.ts#L98)

ONE mempool observation for `address`, or a fail-closed refusal
(`PENDING_SPEND_EVIDENCE_UNAVAILABLE`) when the node cannot answer or the client
cannot ask.

## Parameters

### rpc

[`PendingSpendRpc`](../interfaces/PendingSpendRpc.md)

### address

`string`

### observedAtDaaScore?

`bigint`

## Returns

`Promise`\<\{ `evidence`: [`PendingSpendEvidence`](../interfaces/PendingSpendEvidence.md); `outpoints`: `Set`\<`string`\>; \}\>
