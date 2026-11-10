[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / prepareR0Groth16Proof

# Function: prepareR0Groth16Proof()

> **prepareR0Groth16Proof**(`receiptHex`): `string`

Defined in: [packages/sdk/src/zk/toccata.ts:599](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L599)

Extracts and compresses the Groth16 proof (128 bytes = 256 hex chars)
from a RISC Zero Borsh-encoded receipt using the pinned kaspa-wasm.

## Parameters

### receiptHex

`string`

## Returns

`string`
