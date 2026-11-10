[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / verifyR0Groth16Scripts

# Function: verifyR0Groth16Scripts()

> **verifyR0Groth16Scripts**(`params`): [`R0Groth16VerifyScriptsResult`](../interfaces/R0Groth16VerifyScriptsResult.md)

Defined in: [packages/sdk/src/zk/toccata.ts:1551](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L1551)

Structural verification of RISC Zero Groth16 redeem and signature scripts by opcode parsing
(audit M-03 replaced the substring heuristics). It proves shape, not spendability: only the node
runs the precompile.

## Parameters

### params

[`R0Groth16VerifyScriptsParams`](../interfaces/R0Groth16VerifyScriptsParams.md)

## Returns

[`R0Groth16VerifyScriptsResult`](../interfaces/R0Groth16VerifyScriptsResult.md)
