[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / R0Groth16ScriptParams

# Interface: R0Groth16ScriptParams

Defined in: [packages/sdk/src/zk/toccata.ts:340](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L340)

## Properties

### acknowledgeImageIdOnlyLock?

> `optional` **acknowledgeImageIdOnlyLock?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:358](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L358)

Explicit confirmation of the proof-only authorization model: the lock binds ONLY the image id, so whoever
holds a valid receipt of that program spends the UTXO, to any outputs, on any network, and can replay or
front-run a spend seen in the mempool. Not needed in proof-and-output-bound mode.

***

### addressNetworks?

> `optional` **addressNetworks?**: [`ZkAddressNetwork`](../type-aliases/ZkAddressNetwork.md)[]

Defined in: [packages/sdk/src/zk/toccata.ts:352](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L352)

Networks whose P2SH address is returned. The simnet address is always returned; "testnet-10" is returned
only when listed here (a proof-only lock also needs acknowledgeImageIdOnlyLock: true), never for a proof-only lock
of a public test program (PUBLIC_R0_TEST_VECTORS, matched on the image id), which anyone can spend (HK-16, C-1);
an output-bound lock of such a program gets ZK_PUBLIC_PROGRAM_PAYOUT_TRIGGERABLE. "mainnet" (any spelling) throws
MAINNET_SIGNING_DISABLED while mainnet is locked down (P37): nothing is built.

***

### bindingPolicy?

> `optional` **bindingPolicy?**: [`ZkOutputBindingPolicy`](ZkOutputBindingPolicy.md)

Defined in: [packages/sdk/src/zk/toccata.ts:344](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L344)

***

### imageId

> **imageId**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:341](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L341)

***

### journalHash

> **journalHash**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:342](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L342)

***

### receiptHex

> **receiptHex**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:343](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L343)
