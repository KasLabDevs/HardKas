[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / parseR0Groth16Receipt

# Function: parseR0Groth16Receipt()

> **parseR0Groth16Receipt**(`receiptHex`): [`R0Groth16ReceiptParse`](../interfaces/R0Groth16ReceiptParse.md)

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:168](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L168)

Parses a Borsh Groth16Receipt\<ReceiptClaim\>: u32-LE seal length, seal, MaybePruned\<ReceiptClaim\>
(tag 0 = Value, 1 = Pruned(digest)), verifier_parameters digest.

## Parameters

### receiptHex

`string`

## Returns

[`R0Groth16ReceiptParse`](../interfaces/R0Groth16ReceiptParse.md)
