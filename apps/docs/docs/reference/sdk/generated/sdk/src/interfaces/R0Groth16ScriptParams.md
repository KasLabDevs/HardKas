[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / R0Groth16ScriptParams

# Interface: R0Groth16ScriptParams

Defined in: [packages/sdk/src/zk/toccata.ts:316](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L316)

## Properties

### acknowledgeImageIdOnlyLock?

> `optional` **acknowledgeImageIdOnlyLock?**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:332](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L332)

Explicit confirmation of the proof-only authorization model: the lock binds ONLY the image id, so whoever
holds a valid receipt of that program spends the UTXO, to any outputs, on any network, and can replay or
front-run a spend seen in the mempool. Not needed in proof-and-output-bound mode.

***

### addressNetworks?

> `optional` **addressNetworks?**: [`ZkAddressNetwork`](../type-aliases/ZkAddressNetwork.md)[]

Defined in: [packages/sdk/src/zk/toccata.ts:326](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L326)

Networks whose P2SH address is returned. The simnet address is always returned; "testnet-10" is returned
only when listed here AND acknowledgeImageIdOnlyLock is true, and never for a public test vector
(PUBLIC_R0_TEST_VECTORS), whose lock anyone can spend (HK-16). "mainnet" (any spelling) throws
MAINNET_SIGNING_DISABLED while mainnet is locked down (P37): nothing is built.

***

### bindingPolicy?

> `optional` **bindingPolicy?**: [`ZkOutputBindingPolicy`](ZkOutputBindingPolicy.md)

Defined in: [packages/sdk/src/zk/toccata.ts:320](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L320)

***

### imageId

> **imageId**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:317](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L317)

***

### journalHash

> **journalHash**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:318](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L318)

***

### receiptHex

> **receiptHex**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:319](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L319)
