[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / computeR0ReceiptClaimDigest

# Function: computeR0ReceiptClaimDigest()

> **computeR0ReceiptClaimDigest**(`imageId`, `journalHash`): `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:118](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L118)

Digest of the ReceiptClaim of a zkVM execution that ended Halted(0) with the given image id and journal
digest (input = 0, post = SystemState\{pc 0, merkle_root 0\}, assumptions = 0), as rusty-kaspa's
compute_assert_claim and the Toccata redeem script compute it.

## Parameters

### imageId

`string`

### journalHash

`string`

## Returns

`string`
