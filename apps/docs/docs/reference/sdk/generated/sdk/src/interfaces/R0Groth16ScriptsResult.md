[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / R0Groth16ScriptsResult

# Interface: R0Groth16ScriptsResult

Defined in: [packages/sdk/src/zk/toccata.ts:335](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L335)

## Properties

### authorizationModel

> **authorizationModel**: `ZkLockAuthorizationModel`

Defined in: [packages/sdk/src/zk/toccata.ts:356](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L356)

The lock's authorization model, stated on every result (IMAGE_ID_AND_OUTPUTS in proof-and-output-bound mode).

***

### bindingMode

> **bindingMode**: [`ZkBindingMode`](../type-aliases/ZkBindingMode.md)

Defined in: [packages/sdk/src/zk/toccata.ts:362](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L362)

***

### bindingPolicy?

> `optional` **bindingPolicy?**: [`ZkOutputBindingPolicy`](ZkOutputBindingPolicy.md)

Defined in: [packages/sdk/src/zk/toccata.ts:363](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L363)

***

### boundPayoutAddress?

> `optional` **boundPayoutAddress?**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:366](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L366)

***

### boundPayoutAmount?

> `optional` **boundPayoutAmount?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:367](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L367)

***

### consensusEnforced

> **consensusEnforced**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:365](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L365)

true only for a successful proof-and-output-bound build (the redeem script enforces the outputs).

***

### experimental

> **experimental**: `true`

Defined in: [packages/sdk/src/zk/toccata.ts:375](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L375)

***

### fullSignatureScript

> **fullSignatureScript**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:343](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L343)

***

### imageId

> **imageId**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:338](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L338)

***

### issues

> **issues**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk/toccata.ts:377](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L377)

***

### journalHash

> **journalHash**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:339](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L339)

***

### maxInputSompi?

> `optional` **maxInputSompi?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:374](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L374)

proof-and-output-bound: the largest UTXO the redeem script accepts (bound outputs + maxFeeSompi).

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:336](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L336)

***

### p2shAddresses

> **p2shAddresses**: `object`

Defined in: [packages/sdk/src/zk/toccata.ts:350](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L350)

testnet10 / mainnet are present only on explicit, acknowledged request (see R0Groth16ScriptParams).

#### mainnet?

> `optional` **mainnet?**: `string`

#### simnet

> **simnet**: `string`

#### testnet10?

> `optional` **testnet10?**: `string`

***

### p2shScriptPublicKey

> **p2shScriptPublicKey**: `object`

Defined in: [packages/sdk/src/zk/toccata.ts:345](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L345)

#### script

> **script**: `string`

#### version

> **version**: `number`

***

### precompileOpcode

> **precompileOpcode**: `"0xa6"`

Defined in: [packages/sdk/src/zk/toccata.ts:360](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L360)

***

### preparedProof

> **preparedProof**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:340](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L340)

***

### provingSystemTag

> **provingSystemTag**: `"0x20"`

Defined in: [packages/sdk/src/zk/toccata.ts:361](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L361)

***

### receiptClaimCrossCheck

> **receiptClaimCrossCheck**: `"MATCH"` \| `"NOT_CHECKED"`

Defined in: [packages/sdk/src/zk/toccata.ts:358](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L358)

MATCH: the receipt's pruned claim digest equals the claim of (imageId, journalHash) (HK-19).

***

### receiptClaimDigest?

> `optional` **receiptClaimDigest?**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:359](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L359)

***

### redeemScript

> **redeemScript**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:341](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L341)

***

### redeemScriptHash

> **redeemScriptHash**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:344](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L344)

***

### requiredFundingSompi?

> `optional` **requiredFundingSompi?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:372](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L372)

proof-and-output-bound: the amount to lock at the P2SH. The bound outputs plus the recommended fee for the
measured spend (default compute budget). The fee is fixed once funded: the outputs are bound on-chain.

***

### schema

> **schema**: `"hardkas.zk.toccata.scripts.v1"`

Defined in: [packages/sdk/src/zk/toccata.ts:337](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L337)

***

### sigScript

> **sigScript**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:342](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L342)

***

### warnings

> **warnings**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk/toccata.ts:376](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L376)
