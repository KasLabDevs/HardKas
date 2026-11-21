[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / BuildR0Groth16TxParams

# Interface: BuildR0Groth16TxParams

Defined in: [packages/sdk/src/zk/toccata.ts:416](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L416)

## Properties

### baseComputeMass?

> `optional` **baseComputeMass?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:442](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L442)

Measured non-contextual mass of the spend; measured with kaspa-wasm when omitted.

***

### bindingPolicy?

> `optional` **bindingPolicy?**: [`ZkOutputBindingPolicy`](ZkOutputBindingPolicy.md)

Defined in: [packages/sdk/src/zk/toccata.ts:433](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L433)

***

### computeBudget?

> `optional` **computeBudget?**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:426](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L426)

***

### destinationAddress

> **destinationAddress**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:423](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L423)

***

### feeOptions?

> `optional` **feeOptions?**: [`ToccataFeePolicyOptions`](ToccataFeePolicyOptions.md)

Defined in: [packages/sdk/src/zk/toccata.ts:425](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L425)

***

### feeSompi?

> `optional` **feeSompi?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:424](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L424)

***

### localVerification?

> `optional` **localVerification?**: [`R0Groth16LocalVerificationResult`](R0Groth16LocalVerificationResult.md)

Defined in: [packages/sdk/src/zk/toccata.ts:438](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L438)

The result of verifyR0Groth16ReceiptLocal for this receipt. Only a genuine, verified result produced
in this process for the same image id, journal and proof sets the fact's verifiedOffChain.

***

### ~~mathVerified?~~

> `optional` **mathVerified?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:432](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L432)

#### Deprecated

Ignored (HK-17): the caller cannot assert off-chain verification. Passing true only adds the
warning ZK_CALLER_VERIFICATION_CLAIM_IGNORED. Pass `localVerification` instead.

***

### networkId?

> `optional` **networkId?**: `"simnet"` \| `"mainnet"` \| `"testnet-10"`

Defined in: [packages/sdk/src/zk/toccata.ts:427](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L427)

***

### scripts

> **scripts**: [`R0Groth16ScriptsResult`](R0Groth16ScriptsResult.md)

Defined in: [packages/sdk/src/zk/toccata.ts:417](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L417)

***

### timestamp?

> `optional` **timestamp?**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:440](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L440)

Optional timestamp recorded in the ZK fact. It is not part of the fact's identity unless given.

***

### utxo

> **utxo**: `object`

Defined in: [packages/sdk/src/zk/toccata.ts:418](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L418)

#### amountSompi

> **amountSompi**: `bigint`

#### index

> **index**: `number`

#### transactionId

> **transactionId**: `string`
