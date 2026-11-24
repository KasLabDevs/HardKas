[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / escrowSignatureOf

# Function: escrowSignatureOf()

> **escrowSignatureOf**(`record`, `privateKey`): [`EscrowRefusal`](../interfaces/EscrowRefusal.md) \| \{ `ok`: `true`; `signature`: `string`; \}

Defined in: [packages/sdk/src/escrow.ts:517](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L517)

One signer's `sig` value over the prepared draft (signSilverSpend: the draft must rebuild to its id).

## Parameters

### record

[`EscrowRecord`](../interfaces/EscrowRecord.md)

### privateKey

`string`

## Returns

[`EscrowRefusal`](../interfaces/EscrowRefusal.md) \| \{ `ok`: `true`; `signature`: `string`; \}
