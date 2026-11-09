[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / isConfirmed

# Function: isConfirmed()

> **isConfirmed**(`derived`, `policy?`): `boolean`

Defined in: [packages/artifacts/src/tx-status.ts:586](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L586)

Whether `derived` satisfies `policy.minConfirmations` (FINALIZED always does).

## Parameters

### derived

[`DerivedTxStatus`](../interfaces/DerivedTxStatus.md)

### policy?

[`TxStatusPolicy`](../interfaces/TxStatusPolicy.md) = `derived.policy`

## Returns

`boolean`
