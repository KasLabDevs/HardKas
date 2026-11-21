[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HdWalletPayment

# Interface: HdWalletPayment

Defined in: [packages/sdk/src/hd-wallet.ts:128](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L128)

## Extended by

- [`HdWalletSendResult`](HdWalletSendResult.md)

## Properties

### change

> `readonly` **change**: `object`

Defined in: [packages/sdk/src/hd-wallet.ts:133](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L133)

The change destination (the wallet's next unused change address), and whether the plan pays change at all.

#### address

> `readonly` **address**: `string`

#### amountSompi

> `readonly` **amountSompi**: `bigint`

#### index

> `readonly` **index**: `number`

#### path

> `readonly` **path**: `string`

***

### inputs

> `readonly` **inputs**: readonly [`HdWalletPlannedInput`](HdWalletPlannedInput.md)[]

Defined in: [packages/sdk/src/hd-wallet.ts:131](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L131)

***

### plan

> `readonly` **plan**: [`TxPlanArtifact`](TxPlanArtifact.md)

Defined in: [packages/sdk/src/hd-wallet.ts:129](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L129)

***

### scan

> `readonly` **scan**: [`HdWalletScan`](HdWalletScan.md)

Defined in: [packages/sdk/src/hd-wallet.ts:130](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L130)
