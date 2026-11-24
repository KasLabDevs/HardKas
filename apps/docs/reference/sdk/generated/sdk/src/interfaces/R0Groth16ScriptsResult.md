[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / R0Groth16ScriptsResult

# Interface: R0Groth16ScriptsResult

Defined in: [packages/sdk/src/zk/toccata.ts:361](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L361)

## Properties

### authorizationModel

> **authorizationModel**: `ZkLockAuthorizationModel`

Defined in: [packages/sdk/src/zk/toccata.ts:382](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L382)

The lock's authorization model, stated on every result (IMAGE_ID_AND_OUTPUTS in proof-and-output-bound mode).

***

### bindingMode

> **bindingMode**: [`ZkBindingMode`](../type-aliases/ZkBindingMode.md)

Defined in: [packages/sdk/src/zk/toccata.ts:388](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L388)

***

### bindingPolicy?

> `optional` **bindingPolicy?**: [`ZkOutputBindingPolicy`](ZkOutputBindingPolicy.md)

Defined in: [packages/sdk/src/zk/toccata.ts:389](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L389)

***

### boundPayoutAddress?

> `optional` **boundPayoutAddress?**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:392](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L392)

***

### boundPayoutAmount?

> `optional` **boundPayoutAmount?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:393](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L393)

***

### consensusEnforced

> **consensusEnforced**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:391](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L391)

true only for a successful proof-and-output-bound build (the redeem script enforces the outputs).

***

### experimental

> **experimental**: `true`

Defined in: [packages/sdk/src/zk/toccata.ts:411](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L411)

***

### fullSignatureScript

> **fullSignatureScript**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:369](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L369)

***

### imageId

> **imageId**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:364](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L364)

***

### issues

> **issues**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk/toccata.ts:413](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L413)

***

### journalHash

> **journalHash**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:365](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L365)

***

### maxInputSompi?

> `optional` **maxInputSompi?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:400](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L400)

proof-and-output-bound: the largest UTXO the redeem script accepts (bound outputs + maxFeeSompi).

***

### minimumBoundAmountsSompi?

> `optional` **minimumBoundAmountsSompi?**: `object`

Defined in: [packages/sdk/src/zk/toccata.ts:410](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L410)

G1 · set when the lock is refused with ZK_BOUND_OUTPUT_STORAGE_MASS_ABOVE_LIMIT: the smallest amount of each bound output
whose spend fits the storage-mass limit, the other output unchanged. Absent for an output no amount of which would fit.

#### change?

> `optional` **change?**: `bigint`

#### payout?

> `optional` **payout?**: `bigint`

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:362](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L362)

***

### p2shAddresses

> **p2shAddresses**: `object`

Defined in: [packages/sdk/src/zk/toccata.ts:376](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L376)

testnet10 is present only on explicit, acknowledged request (see R0Groth16ScriptParams); mainnet never while locked down.

#### mainnet?

> `optional` **mainnet?**: `string`

#### simnet

> **simnet**: `string`

#### testnet10?

> `optional` **testnet10?**: `string`

***

### p2shScriptPublicKey

> **p2shScriptPublicKey**: `object`

Defined in: [packages/sdk/src/zk/toccata.ts:371](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L371)

#### script

> **script**: `string`

#### version

> **version**: `number`

***

### precompileOpcode

> **precompileOpcode**: `"0xa6"`

Defined in: [packages/sdk/src/zk/toccata.ts:386](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L386)

***

### preparedProof

> **preparedProof**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:366](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L366)

***

### provingSystemTag

> **provingSystemTag**: `"0x20"`

Defined in: [packages/sdk/src/zk/toccata.ts:387](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L387)

***

### receiptClaimCrossCheck

> **receiptClaimCrossCheck**: `"MATCH"` \| `"NOT_CHECKED"`

Defined in: [packages/sdk/src/zk/toccata.ts:384](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L384)

MATCH: the receipt's pruned claim digest equals the claim of (imageId, journalHash) (HK-19).

***

### receiptClaimDigest?

> `optional` **receiptClaimDigest?**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:385](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L385)

***

### redeemScript

> **redeemScript**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:367](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L367)

***

### redeemScriptHash

> **redeemScriptHash**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:370](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L370)

***

### requiredFundingSompi?

> `optional` **requiredFundingSompi?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:398](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L398)

proof-and-output-bound: the amount to lock at the P2SH. The bound outputs plus the recommended fee for the
measured spend (default compute budget). The fee is fixed once funded: the outputs are bound on-chain.

***

### schema

> **schema**: `"hardkas.zk.toccata.scripts.v1"`

Defined in: [packages/sdk/src/zk/toccata.ts:363](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L363)

***

### sigScript

> **sigScript**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:368](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L368)

***

### spendStorageMass?

> `optional` **spendStorageMass?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:405](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L405)

G1 · proof-and-output-bound: the storage mass (KIP-9, the node's rule) of the spend funded with requiredFundingSompi;
at most BLOCK_STORAGE_MASS_LIMIT, or the lock is refused (ZK_BOUND_OUTPUT_STORAGE_MASS_ABOVE_LIMIT).

***

### warnings

> **warnings**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk/toccata.ts:412](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L412)
