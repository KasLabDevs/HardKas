[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / isConfirmed

# Function: isConfirmed()

> **isConfirmed**(`derived`, `policy?`): `boolean`

Defined in: [packages/artifacts/src/tx-status.ts:586](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/tx-status.ts#L586)

Whether `derived` satisfies `policy.minConfirmations` (FINALIZED always does).

## Parameters

### derived

[`DerivedTxStatus`](../interfaces/DerivedTxStatus.md)

### policy?

[`TxStatusPolicy`](../interfaces/TxStatusPolicy.md) = `derived.policy`

## Returns

`boolean`
