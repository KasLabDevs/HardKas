[**HardKAS SDK**](../../../../../README.md)

***

[HardKAS SDK](../../../../../README.md) / [sdk/src](../../../README.md) / [pskt](../README.md) / PsktSignContext

# Interface: PsktSignContext

Defined in: [packages/sdk/src/pskt/input-verification.ts:23](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/pskt/input-verification.ts#L23)

The caller's side of a PSKT signature (A1): its own network and its node for that network.

## Properties

### networkId?

> `readonly` `optional` **networkId?**: `string`

Defined in: [packages/sdk/src/pskt/input-verification.ts:25](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/pskt/input-verification.ts#L25)

The network the caller signs for: its workspace's, or one it chose explicitly. Never read from the session.

***

### node?

> `readonly` `optional` **node?**: [`PsktUtxoSource`](PsktUtxoSource.md)

Defined in: [packages/sdk/src/pskt/input-verification.ts:27](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/pskt/input-verification.ts#L27)

The caller's node for `networkId`; every input to be signed must be listed by it as unspent.
