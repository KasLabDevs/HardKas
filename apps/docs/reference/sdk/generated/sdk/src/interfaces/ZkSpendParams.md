[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkSpendParams

# Interface: ZkSpendParams

Defined in: [packages/sdk/src/zk/spend.ts:29](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L29)

## Properties

### allowUnsyncedNode?

> `readonly` `optional` **allowUnsyncedNode?**: `boolean`

Defined in: [packages/sdk/src/zk/spend.ts:44](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L44)

sdk.tx.send's explicit escape for a controlled local network (simnet/devnet only).

***

### computeBudget?

> `readonly` `optional` **computeBudget?**: `number`

Defined in: [packages/sdk/src/zk/spend.ts:38](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L38)

***

### destinationAddress?

> `readonly` `optional` **destinationAddress?**: `string`

Defined in: [packages/sdk/src/zk/spend.ts:35](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L35)

proof-only: where the UTXO (minus the fee) goes. proof-and-output-bound: optional, it must be the bound payout.

***

### feeOptions?

> `readonly` `optional` **feeOptions?**: [`ToccataFeePolicyOptions`](ToccataFeePolicyOptions.md)

Defined in: [packages/sdk/src/zk/spend.ts:37](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L37)

***

### feeSompi?

> `readonly` `optional` **feeSompi?**: `bigint`

Defined in: [packages/sdk/src/zk/spend.ts:36](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L36)

***

### localVerification?

> `readonly` `optional` **localVerification?**: [`R0Groth16LocalVerificationResult`](R0Groth16LocalVerificationResult.md)

Defined in: [packages/sdk/src/zk/spend.ts:40](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L40)

A verifyR0Groth16ReceiptLocal result for this receipt (sets the fact's verifiedOffChain).

***

### scripts

> `readonly` **scripts**: [`R0Groth16ScriptsResult`](R0Groth16ScriptsResult.md)

Defined in: [packages/sdk/src/zk/spend.ts:31](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L31)

The lock: a successful buildR0Groth16Scripts result. Checked again here (verifyR0Groth16Scripts), never trusted.

***

### url?

> `readonly` `optional` **url?**: `string`

Defined in: [packages/sdk/src/zk/spend.ts:42](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L42)

The endpoint to send to: it must be this instance's client's (sdk.tx.send, ENDPOINT-AUTHORITY-1).

***

### utxo

> `readonly` **utxo**: `object`

Defined in: [packages/sdk/src/zk/spend.ts:33](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L33)

The lock's UTXO. Without `amountSompi` the amount is read from the node (this instance's client).

#### amountSompi?

> `readonly` `optional` **amountSompi?**: `bigint`

#### index

> `readonly` **index**: `number`

#### transactionId

> `readonly` **transactionId**: `string`
