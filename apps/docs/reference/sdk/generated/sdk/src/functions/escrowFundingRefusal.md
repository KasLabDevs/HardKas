[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / escrowFundingRefusal

# Function: escrowFundingRefusal()

> **escrowFundingRefusal**(`record`): [`EscrowRefusal`](../interfaces/EscrowRefusal.md)

Defined in: [packages/sdk/src/escrow.ts:297](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L297)

ESCROW-SAFETY-2: an escrow is funded once; a funding whose outcome is unknown is reconciled, never followed by another.

## Parameters

### record

[`EscrowRecord`](../interfaces/EscrowRecord.md)

## Returns

[`EscrowRefusal`](../interfaces/EscrowRefusal.md)
