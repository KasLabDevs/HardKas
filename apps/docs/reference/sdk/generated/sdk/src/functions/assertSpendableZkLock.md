[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / assertSpendableZkLock

# Function: assertSpendableZkLock()

> **assertSpendableZkLock**(`scripts`): `void`

Defined in: [packages/sdk/src/zk/spend.ts:72](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L72)

The lock is one HardKAS builds and verify-scripts accepts: the pinned RISC Zero verifier, a redeem script byte-identical
to HardKAS's for the parameters it carries (and, for an output-bound lock, the outputs it says it binds), a signature
script that ends with that redeem script, and a P2SH script that is the hash of it. ZK_SPEND_LOCK_REFUSED otherwise.

## Parameters

### scripts

[`R0Groth16ScriptsResult`](../interfaces/R0Groth16ScriptsResult.md)

## Returns

`void`
