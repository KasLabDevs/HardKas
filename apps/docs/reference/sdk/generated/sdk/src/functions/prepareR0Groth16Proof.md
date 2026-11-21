[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / prepareR0Groth16Proof

# Function: prepareR0Groth16Proof()

> **prepareR0Groth16Proof**(`receiptHex`): `string`

Defined in: [packages/sdk/src/zk/toccata.ts:676](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L676)

Extracts and compresses the Groth16 proof (128 bytes = 256 hex chars)
from a RISC Zero Borsh-encoded receipt using the pinned kaspa-wasm.

## Parameters

### receiptHex

`string`

## Returns

`string`
