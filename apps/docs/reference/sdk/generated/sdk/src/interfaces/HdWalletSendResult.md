[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HdWalletSendResult

# Interface: HdWalletSendResult

Defined in: [packages/sdk/src/hd-wallet.ts:136](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L136)

## Extends

- [`HdWalletPayment`](HdWalletPayment.md)

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

#### Inherited from

[`HdWalletPayment`](HdWalletPayment.md).[`change`](HdWalletPayment.md#change)

***

### inputs

> `readonly` **inputs**: readonly [`HdWalletPlannedInput`](HdWalletPlannedInput.md)[]

Defined in: [packages/sdk/src/hd-wallet.ts:131](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L131)

#### Inherited from

[`HdWalletPayment`](HdWalletPayment.md).[`inputs`](HdWalletPayment.md#inputs)

***

### plan

> `readonly` **plan**: [`TxPlanArtifact`](TxPlanArtifact.md)

Defined in: [packages/sdk/src/hd-wallet.ts:129](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L129)

#### Inherited from

[`HdWalletPayment`](HdWalletPayment.md).[`plan`](HdWalletPayment.md#plan)

***

### scan

> `readonly` **scan**: [`HdWalletScan`](HdWalletScan.md)

Defined in: [packages/sdk/src/hd-wallet.ts:130](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L130)

#### Inherited from

[`HdWalletPayment`](HdWalletPayment.md).[`scan`](HdWalletPayment.md#scan)

***

### sent

> `readonly` **sent**: `object`

Defined in: [packages/sdk/src/hd-wallet.ts:138](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L138)

#### alreadySubmitted?

> `optional` **alreadySubmitted?**: `boolean`

TX-SEND-IDEMPOTENT-1: this workspace had already recorded a submission of the transaction and the node holds it:
nothing was broadcast, `submission` is the recorded one and `derived` the state one observation found.

#### artifactId?

> `optional` **artifactId?**: `string`

#### derived?

> `optional` **derived?**: `DerivedTxStatus`

#### mode?

> `optional` **mode?**: `string`

#### nodeCheck?

> `optional` **nodeCheck?**: `SendNodeCheck`

INT9 · I-2 (TX-SEND-IDEMPOTENT-3): for a payment with no submission recorded here, the read-only node check that
let the broadcast go ahead — NOT_OBSERVED (every read answered, nothing of it found) or UNKNOWN (a read the node
could not answer). A positive state (MEMPOOL, IN_CHAIN, ACCEPTED, CONFIRMED, FINALIZED) refuses the send instead
(ALREADY_SUBMITTED). Returned, never recorded.

#### receipt

> **receipt**: [`TxReceiptArtifact`](TxReceiptArtifact.md) \| `TxSubmissionArtifact`

The artifact this send produced: a simulated `hardkas.txReceipt` in the
simulator, or the immutable `hardkas.txSubmission.v1` for a real broadcast
(R-iii part 1). Read `submission` for the typed real-send record.

#### receiptPath?

> `optional` **receiptPath?**: `string`

#### rejection?

> `optional` **rejection?**: `NodeRejection`

F1.6 · a v1 send (PAYMENT-PREFLIGHT-1: or a payment sent with `preflight`) the node rejected: the class of its
rejection (final: never retried, rebuilt or re-sent).

#### simulated?

> `optional` **simulated?**: `boolean`

#### submission?

> `optional` **submission?**: `TxSubmissionArtifact`

#### submitted?

> `optional` **submitted?**: `boolean`

#### txId?

> `optional` **txId?**: `string`

***

### signed

> `readonly` **signed**: [`SignedTxArtifact`](SignedTxArtifact.md)

Defined in: [packages/sdk/src/hd-wallet.ts:137](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L137)
