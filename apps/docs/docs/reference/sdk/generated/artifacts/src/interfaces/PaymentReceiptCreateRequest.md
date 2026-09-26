[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / PaymentReceiptCreateRequest

# Interface: PaymentReceiptCreateRequest

Defined in: [packages/artifacts/src/payment-receipts.ts:5](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/payment-receipts.ts#L5)

## Properties

### invoice

> **invoice**: `object`

Defined in: [packages/artifacts/src/payment-receipts.ts:6](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/payment-receipts.ts#L6)

#### amountSompi

> **amountSompi**: `bigint`

#### id

> **id**: `string`

#### merchantId

> **merchantId**: `string`

#### paymentAddress

> **paymentAddress**: `string`

***

### networkId?

> `optional` **networkId?**: `string`

Defined in: [packages/artifacts/src/payment-receipts.ts:25](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/payment-receipts.ts#L25)

network the payment was received on — defaults to 'simnet'

***

### paidAt?

> `optional` **paidAt?**: `number`

Defined in: [packages/artifacts/src/payment-receipts.ts:23](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/payment-receipts.ts#L23)

epoch ms — inject a fixed value in tests to keep the content hash deterministic

***

### paymentCheckResult

> **paymentCheckResult**: `object`

Defined in: [packages/artifacts/src/payment-receipts.ts:12](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/payment-receipts.ts#L12)

#### amountFoundSompi

> **amountFoundSompi**: `bigint`

#### confirmations

> **confirmations**: `number`

#### status

> **status**: `string`

#### txId?

> `optional` **txId?**: `string`

***

### policyResult

> **policyResult**: `object`

Defined in: [packages/artifacts/src/payment-receipts.ts:18](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/payment-receipts.ts#L18)

#### requiredConfirmations

> **requiredConfirmations**: `number`

#### riskProfile

> **riskProfile**: `string`
