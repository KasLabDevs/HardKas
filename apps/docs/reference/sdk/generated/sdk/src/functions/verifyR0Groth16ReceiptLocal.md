[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / verifyR0Groth16ReceiptLocal

# Function: verifyR0Groth16ReceiptLocal()

> **verifyR0Groth16ReceiptLocal**(`params`): `Promise`\<[`R0Groth16LocalVerificationResult`](../interfaces/R0Groth16LocalVerificationResult.md)\>

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:318](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L318)

Verifies a RISC Zero Groth16 receipt locally: recomputes the claim digest from (imageId, journalHash),
derives the five public inputs with the pinned control root / BN254 control id, decodes the seal and runs
the snarkjs pairing against the pinned RISC Zero verifying key (anchored: PINNED_REGISTRY). A VERIFIED
result means "a valid RISC Zero Groth16 proof exists for this program and journal". It says nothing about
what the guest program does, and it is not on-chain acceptance (the node decides; the off-chain and
on-chain verifiers are different implementations: snarkjs vs arkworks).

## Parameters

### params

#### imageId

`string`

#### journalHash

`string`

#### receiptHex

`string`

#### timeoutMs?

`number`

## Returns

`Promise`\<[`R0Groth16LocalVerificationResult`](../interfaces/R0Groth16LocalVerificationResult.md)\>
