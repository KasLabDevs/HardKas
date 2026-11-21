[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / checkEscrowRelease

# Function: checkEscrowRelease()

> **checkEscrowRelease**(`record`, `id`): [`EscrowReleaseReady`](../interfaces/EscrowReleaseReady.md) \| [`EscrowRefusal`](../interfaces/EscrowRefusal.md)

Defined in: [packages/sdk/src/escrow.ts:575](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L575)

Everything checked before a release is sent: not released, no release sent and unreconciled (ESCROW-SAFETY-2), every
signature in place, the branch's policy unchanged since preparation, the finalized spend's outputs those prepared,
and every required signature valid (BIP340) by the escrow's keys. Throws only for outputs mutated after preparation.

## Parameters

### record

[`EscrowRecord`](../interfaces/EscrowRecord.md)

### id

`string`

## Returns

[`EscrowReleaseReady`](../interfaces/EscrowReleaseReady.md) \| [`EscrowRefusal`](../interfaces/EscrowRefusal.md)
