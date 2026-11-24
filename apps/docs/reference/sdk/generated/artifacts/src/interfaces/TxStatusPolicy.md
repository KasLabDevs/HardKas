[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / TxStatusPolicy

# Interface: TxStatusPolicy

Defined in: [packages/artifacts/src/tx-status.ts:43](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/tx-status.ts#L43)

## Properties

### confirmationUnit

> `readonly` **confirmationUnit**: `"blue-score"`

Defined in: [packages/artifacts/src/tx-status.ts:50](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/tx-status.ts#L50)

***

### minConfirmations

> `readonly` **minConfirmations**: `number`

Defined in: [packages/artifacts/src/tx-status.ts:49](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/tx-status.ts#L49)

Blue-score depth at which `isConfirmed(policy)` answers true.

***

### origin

> `readonly` **origin**: `"hardkas-product-default"` \| `"user"`

Defined in: [packages/artifacts/src/tx-status.ts:47](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/tx-status.ts#L47)

Who chose `minConfirmations`: never "kaspa"/"upstream" — depth thresholds are a product choice.

***

### policyId

> `readonly` **policyId**: `string`

Defined in: [packages/artifacts/src/tx-status.ts:44](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/tx-status.ts#L44)

***

### policyVersion

> `readonly` **policyVersion**: `number`

Defined in: [packages/artifacts/src/tx-status.ts:45](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/tx-status.ts#L45)
