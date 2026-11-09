[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / verifyR0Groth16ReceiptLocal

# Function: verifyR0Groth16ReceiptLocal()

> **verifyR0Groth16ReceiptLocal**(`params`): `Promise`\<[`R0Groth16LocalVerificationResult`](../interfaces/R0Groth16LocalVerificationResult.md)\>

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:283](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L283)

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
