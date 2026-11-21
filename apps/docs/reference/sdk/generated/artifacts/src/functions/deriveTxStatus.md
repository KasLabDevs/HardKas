[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / deriveTxStatus

# Function: deriveTxStatus()

> **deriveTxStatus**(`input`): [`DerivedTxStatus`](../interfaces/DerivedTxStatus.md)

Defined in: [packages/artifacts/src/tx-status.ts:396](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/tx-status.ts#L396)

Derives the state of `txId` from ONE submission (optional) and N observations
under `policy`. Pure and deterministic: same evidence ⇒ same conclusion.
Histories are per observer; the top level combines them without causality.

## Parameters

### input

#### observations

`unknown`[]

#### policy?

[`TxStatusPolicy`](../interfaces/TxStatusPolicy.md)

#### submission?

`unknown`

#### txId

`string`

## Returns

[`DerivedTxStatus`](../interfaces/DerivedTxStatus.md)
