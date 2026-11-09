[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / BuildR0Groth16TxParams

# Interface: BuildR0Groth16TxParams

Defined in: [packages/sdk/src/zk/toccata.ts:380](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L380)

## Properties

### baseComputeMass?

> `optional` **baseComputeMass?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:406](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L406)

Measured non-contextual mass of the spend; measured with kaspa-wasm when omitted.

***

### bindingPolicy?

> `optional` **bindingPolicy?**: [`ZkOutputBindingPolicy`](ZkOutputBindingPolicy.md)

Defined in: [packages/sdk/src/zk/toccata.ts:397](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L397)

***

### computeBudget?

> `optional` **computeBudget?**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:390](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L390)

***

### destinationAddress

> **destinationAddress**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:387](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L387)

***

### feeOptions?

> `optional` **feeOptions?**: [`ToccataFeePolicyOptions`](ToccataFeePolicyOptions.md)

Defined in: [packages/sdk/src/zk/toccata.ts:389](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L389)

***

### feeSompi?

> `optional` **feeSompi?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:388](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L388)

***

### localVerification?

> `optional` **localVerification?**: [`R0Groth16LocalVerificationResult`](R0Groth16LocalVerificationResult.md)

Defined in: [packages/sdk/src/zk/toccata.ts:402](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L402)

The result of verifyR0Groth16ReceiptLocal for this receipt. Only a genuine, verified result produced
in this process for the same image id, journal and proof sets the fact's verifiedOffChain.

***

### ~~mathVerified?~~

> `optional` **mathVerified?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:396](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L396)

#### Deprecated

Ignored (HK-17): the caller cannot assert off-chain verification. Passing true only adds the
warning ZK_CALLER_VERIFICATION_CLAIM_IGNORED. Pass `localVerification` instead.

***

### networkId?

> `optional` **networkId?**: `"simnet"` \| `"mainnet"` \| `"testnet-10"`

Defined in: [packages/sdk/src/zk/toccata.ts:391](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L391)

***

### scripts

> **scripts**: [`R0Groth16ScriptsResult`](R0Groth16ScriptsResult.md)

Defined in: [packages/sdk/src/zk/toccata.ts:381](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L381)

***

### timestamp?

> `optional` **timestamp?**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:404](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L404)

Optional timestamp recorded in the ZK fact. It is not part of the fact's identity unless given.

***

### utxo

> **utxo**: `object`

Defined in: [packages/sdk/src/zk/toccata.ts:382](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L382)

#### amountSompi

> **amountSompi**: `bigint`

#### index

> **index**: `number`

#### transactionId

> **transactionId**: `string`
